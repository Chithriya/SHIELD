/**
 * VoiceTriggerService — background-capable voice phrase detection
 *
 * Key fixes for expo-speech-recognition 56.x:
 * 1. addSpeechRecognitionListener removed — use ExpoSpeechRecognitionModule.addListener()
 * 2. EXTRA_MAX_RESULTS / EXTRA_PARTIAL_RESULTS removed from AndroidIntentOptions type
 *    — replaced with supported options: EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS etc.
 * 3. Event parameters typed with ExpoSpeechRecognitionResultEvent / ExpoSpeechRecognitionErrorEvent
 * 4. continuous:true for Android 13+ (keeps session alive across utterances)
 * 5. Restart loop for Android 12- (session ends after each utterance, we restart)
 * 6. Persistent "ongoing" notification keeps Android from killing the JS process
 *    when screen is turned off
 * 7. expo-keep-awake prevents CPU sleep during active listening
 */

import {
  ExpoSpeechRecognitionModule,
} from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionResultEvent,
  ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';
import * as Notifications from 'expo-notifications';
import * as KeepAwake from 'expo-keep-awake';
import { Platform } from 'react-native';
import { storage } from './StorageService';

type TriggerCallback = () => void;

const FOREGROUND_NOTIF_ID = 'shield-voice-bg';
const KEEP_AWAKE_TAG      = 'shield-voice-trigger';

class VoiceTriggerService {
  private _isListening   = false;
  private onTrigger:     TriggerCallback | null = null;
  private triggerPhrase: string = '';
  private restartTimer:  ReturnType<typeof setTimeout> | null = null;
  private removeListeners: (() => void)[] = [];
  private startAttempts  = 0;
  private isContinuous   = false;

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC
  // ─────────────────────────────────────────────────────────────────────────

  async start(onTrigger: TriggerCallback): Promise<void> {
    // Guard: don't double-start
    if (this._isListening) {
      console.log('[SHIELD] VoiceTrigger already active — skipping start()');
      return;
    }

    const enabled = await storage.getVoiceEnabled();
    if (!enabled) {
      console.log('[SHIELD] Voice trigger disabled in settings');
      return;
    }

    this.triggerPhrase = (await storage.getVoicePhrase()).toLowerCase().trim();
    if (!this.triggerPhrase) {
      console.log('[SHIELD] No voice trigger phrase set — skipping');
      return;
    }

    // Request permissions
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      console.warn('[SHIELD] Speech recognition permission denied');
      return;
    }

    // isRecognitionAvailable() is SYNCHRONOUS (not async)
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    if (!available) {
      console.warn('[SHIELD] Speech recognition not available on this device');
      return;
    }

    // continuous mode: Android 13+ (API 33+) only
    this.isContinuous = Platform.OS === 'android'
      ? (Platform.Version as number) >= 33
      : true;

    this.onTrigger     = onTrigger;
    this._isListening  = true;
    this.startAttempts = 0;

    this.attachListeners();

    // Persistent notification = keeps JS thread alive when screen is off
    await this.showPersistentNotification();

    // Keep CPU awake so timers / callbacks still fire with screen off
    KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    await this.doStart();

    console.log(
      `[SHIELD] 🎤 Voice trigger ACTIVE — phrase:"${this.triggerPhrase}" continuous:${this.isContinuous}`
    );
  }

  stop(): void {
    this._isListening = false;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    for (const rm of this.removeListeners) { try { rm(); } catch {} }
    this.removeListeners = [];

    try { ExpoSpeechRecognitionModule.abort(); } catch {}

    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    Notifications.dismissNotificationAsync(FOREGROUND_NOTIF_ID).catch(() => {});
    console.log('[SHIELD] Voice trigger stopped');
  }

  // Synchronous — safe to call from render or right after start() resolves
  isActive(): boolean { return this._isListening; }

  async refreshPhrase(): Promise<void> {
    this.triggerPhrase = (await storage.getVoicePhrase()).toLowerCase().trim();
    console.log('[SHIELD] Phrase refreshed:', this.triggerPhrase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — LISTENERS
  // In expo-speech-recognition 56.x, addSpeechRecognitionListener is removed.
  // Use ExpoSpeechRecognitionModule.addListener() directly instead.
  // ─────────────────────────────────────────────────────────────────────────

  private attachListeners(): void {
    // Remove any previous listeners first
    for (const rm of this.removeListeners) { try { rm(); } catch {} }
    this.removeListeners = [];

    const s1 = ExpoSpeechRecognitionModule.addListener(
      'result',
      (e: ExpoSpeechRecognitionResultEvent) => this.onResult(e),
    );
    const s2 = ExpoSpeechRecognitionModule.addListener(
      'error',
      (e: ExpoSpeechRecognitionErrorEvent) => this.onError(e),
    );
    const s3 = ExpoSpeechRecognitionModule.addListener(
      'end',
      () => this.onEnd(),
    );

    this.removeListeners = [
      () => s1.remove(),
      () => s2.remove(),
      () => s3.remove(),
    ];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — RECOGNITION LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  private async doStart(): Promise<void> {
    if (!this._isListening) return;

    try {
      // Brief pause to avoid "recognizer busy" error from previous session
      await new Promise(r => setTimeout(r, 400));
      if (!this._isListening) return; // may have been stopped during pause

      ExpoSpeechRecognitionModule.start({
        lang:           'en-IN',
        interimResults: true,
        continuous:     this.isContinuous,
        requiresOnDeviceRecognition: false,
        // contextualStrings biases recognition toward the trigger phrase words
        contextualStrings: this.triggerPhrase.split(/\s+/).filter(Boolean),
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL:  'free_form',
          // Long silence tolerance — user may be in danger, can't speak fast
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS:          10000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS:  6000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS:                    1000,
        },
      });

      this.startAttempts = 0;
      console.log('[SHIELD] 🎙 Listening...');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[SHIELD] doStart error:', msg);
      this.startAttempts += 1;
      // Exponential backoff, max 12s
      const delay = Math.min(1500 * this.startAttempts, 12000);
      this.scheduleRestart(delay);
    }
  }

  private onResult(event: ExpoSpeechRecognitionResultEvent): void {
    if (!this._isListening) return;

    // expo-speech-recognition 56.x shape:
    //   event.results  → ExpoSpeechRecognitionResult[]
    //   each result    → { transcript: string, confidence: number, segments: [...] }
    //   event.isFinal  → whether this is the final result
    const results = event.results ?? [];
    const transcripts: string[] = results
      .map(r => r.transcript)
      .filter(Boolean);

    if (!transcripts.length) return;
    console.log('[SHIELD] Heard:', transcripts, '| final:', event.isFinal);

    for (const t of transcripts) {
      const lower = t.toLowerCase().trim();
      if (!lower) continue;
      if (this.matches(lower)) {
        console.log('[SHIELD] ✅ TRIGGER MATCHED:', t);
        this._isListening = false;
        try { ExpoSpeechRecognitionModule.abort(); } catch {}
        KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
        Notifications.dismissNotificationAsync(FOREGROUND_NOTIF_ID).catch(() => {});
        this.onTrigger?.();
        return;
      }
    }
  }

  private onError(event: ExpoSpeechRecognitionErrorEvent): void {
    const code = event?.error ?? '';
    console.warn('[SHIELD] Speech error:', code, event?.message ?? '');
    if (!this._isListening) return;

    // Normal / recoverable errors — restart quickly
    const normal: typeof code[] = ['no-speech', 'speech-timeout', 'aborted'];
    this.scheduleRestart(normal.includes(code) ? 700 : 2500);
  }

  private onEnd(): void {
    if (!this._isListening) return;
    // "end" always means the session stopped — restart regardless of mode.
    // In continuous mode this happens on timeout or error.
    // In non-continuous mode this happens after each utterance.
    console.log('[SHIELD] Session ended — restarting');
    this.scheduleRestart(600);
  }

  private scheduleRestart(delay: number): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(async () => {
      if (this._isListening) await this.doStart();
    }, delay);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — MATCHING
  // ─────────────────────────────────────────────────────────────────────────

  private matches(heard: string): boolean {
    if (!heard || !this.triggerPhrase) return false;

    // Exact substring — fastest path
    if (heard.includes(this.triggerPhrase)) return true;

    const hw = heard.split(/\s+/).filter(w => w.length > 1);
    const pw = this.triggerPhrase.split(/\s+/).filter(w => w.length > 1);
    if (pw.length === 0) return false;

    const matchedCount = pw.filter(p =>
      hw.some(h =>
        h === p ||
        h.includes(p) ||
        p.includes(h) ||
        this.lev(h, p) <= Math.max(1, Math.floor(p.length / 4))
      )
    ).length;

    const ratio = matchedCount / pw.length;
    console.log(`[SHIELD] Match: ${matchedCount}/${pw.length} (${(ratio * 100).toFixed(0)}%)`);
    return ratio >= 0.65;
  }

  private lev(a: string, b: string): number {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        d[i][j] = a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    return d[m][n];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — PERSISTENT NOTIFICATION
  // Android kills JS threads when screen turns off unless there is an
  // "ongoing" high-priority notification keeping the process awake.
  // ─────────────────────────────────────────────────────────────────────────

  private async showPersistentNotification(): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: FOREGROUND_NOTIF_ID,
        content: {
          title:    '🛡️ SHIELD is protecting you',
          body:     'Listening for voice trigger. Tap to open SHIELD.',
          sticky:   true,
          priority: Notifications.AndroidNotificationPriority.LOW,
          data:     { type: 'shield_voice_bg' },
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[SHIELD] Persistent notification error:', e);
    }
  }
}

export const voiceTriggerService = new VoiceTriggerService();