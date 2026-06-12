import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { locationService, getMapsLink } from './LocationService';
import { smsService } from './SmsService';
import { voiceTriggerService } from './VoiceTriggerService';
import { storage } from './StorageService';
import { AlertEvent, TriggerType } from '../constants/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

type SosCb = (alert: AlertEvent) => void;

class ShieldService {
  private sosActive          = false;
  private onSosFired: SosCb | null = null;
  private liveTrackingActive = false;
  private voiceTriggerCb: (() => void) | null = null;
  private initialized        = false;
  private initializing       = false;

  async initialize(onSosFired: SosCb) {
    if (this.initializing) return;
    this.initializing = true;

    try {
      this.onSosFired = onSosFired;

      await Notifications.requestPermissionsAsync();
      await locationService.requestPermissions();

      // Stop any previously running voice instance before starting a new one
      voiceTriggerService.stop();

      this.voiceTriggerCb = () => {
        this.triggerSOS('VOICE_TRIGGER');
      };

      await voiceTriggerService.start(this.voiceTriggerCb);
      this.initialized = true;
      console.log('[SHIELD] Service initialized — voice + location active');
    } catch (e) {
      console.warn('[SHIELD] initialize error:', e);
    } finally {
      // Always clear flag so re-init is possible after error
      this.initializing = false;
    }
  }

  async triggerSOS(trigger: TriggerType = 'MANUAL') {
    if (this.sosActive) return;
    this.sosActive = true;

    console.log(`[SHIELD] SOS TRIGGERED: ${trigger}`);

    const { lat, lng } = await locationService.getLocation();

    const alert: AlertEvent = {
      id:          Date.now().toString(),
      latitude:    lat,
      longitude:   lng,
      timestamp:   Date.now(),
      triggerType: trigger,
      resolved:    false,
    };

    smsService.sendSosAlerts(lat, lng, trigger);
    await this.startLiveTracking();
    this.vibrate();
    await this.showNotification(lat, lng);
    this.onSosFired?.(alert);
  }

  async cancelSOS() {
    this.sosActive          = false;
    this.liveTrackingActive = false;
    locationService.stopLiveTracking();
    Notifications.dismissAllNotificationsAsync();

    if (this.voiceTriggerCb) {
      voiceTriggerService.stop();
      await new Promise(r => setTimeout(r, 1000));
      await voiceTriggerService.start(this.voiceTriggerCb);
      console.log('[SHIELD] Voice trigger restarted after SOS cancel');
    }

    console.log('[SHIELD] SOS cancelled');
  }

  private async startLiveTracking() {
    if (this.liveTrackingActive) return;
    this.liveTrackingActive = true;

    try {
      await locationService.startLiveTracking(
        () => {},
        (lat, lng) => {
          smsService.sendLiveUpdate(lat, lng);
          console.log('[SHIELD] Live location SMS sent:', lat, lng);
        }
      );
      console.log('[SHIELD] Live tracking started — SMS every 1 min');
    } catch (e) {
      console.warn('[SHIELD] Live tracking failed:', e);
      this.liveTrackingActive = false;
    }
  }

  private async showNotification(lat: number, lng: number) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title:    '🆘 SHIELD SOS ACTIVE',
          body:     `Emergency alert sent! Location: ${getMapsLink(lat, lng)}`,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[SHIELD] Notification error:', e);
    }
  }

  private async vibrate() {
    try {
      for (let i = 0; i < 6; i++) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise(r => setTimeout(r, 200));
      }
    } catch {}
  }

  isSosActive()   { return this.sosActive; }
  isInitialized() { return this.initialized; }

  /** Call from SettingsScreen after changing voice phrase/enabled state */
  async restartVoice() {
    if (this.sosActive)        return; // never restart mid-SOS
    if (!this.voiceTriggerCb)  return; // service not yet initialized
    voiceTriggerService.stop();
    await new Promise(r => setTimeout(r, 500));
    const voiceEnabled = await storage.getVoiceEnabled();
    const phrase       = await storage.getVoicePhrase();
    if (voiceEnabled && phrase) {
      await voiceTriggerService.start(this.voiceTriggerCb);
    }
    console.log('[SHIELD] Voice trigger restarted after settings change');
  }

  destroy() {
    this.sosActive          = false;
    this.liveTrackingActive = false;
    this.initializing       = false;
    this.initialized        = false;
    voiceTriggerService.stop();
    locationService.stopLiveTracking();
    this.onSosFired     = null;
    this.voiceTriggerCb = null;
    console.log('[SHIELD] Service destroyed');
  }
}

export const shieldService = new ShieldService();
