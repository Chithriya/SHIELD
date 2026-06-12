import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Vibration, BackHandler, StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { Colors } from '../constants/colors';

const FAKE_CALL_VOICE_PATH =
  (FileSystem.documentDirectory ?? '') + 'fake_call_voice.m4a';

const DEFAULT_MESSAGE =
  "I have received your alert. I'm on my way to help you. " +
  "Just stay calm and stay safe. I will be there in 5 minutes.";

export default function FakeCallScreen() {
  const { callerName } = useLocalSearchParams<{ callerName: string }>();
  const name = callerName ?? 'Amma';

  const [answered,  setAnswered]  = useState(false);
  const [callSecs,  setCallSecs]  = useState(0);
  const callTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDecline = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useAudioPlayer(null);

  useEffect(() => {
    Vibration.vibrate([0, 1000, 1000, 1000, 1000, 1000], true);
    autoDecline.current = setTimeout(decline, 30000);
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      Vibration.cancel();
      Speech.stop();
      try { player.remove(); } catch {}
      if (callTimer.current)   clearInterval(callTimer.current);
      if (autoDecline.current) clearTimeout(autoDecline.current);
      back.remove();
    };
  }, []);

  const answer = async () => {
    setAnswered(true);
    Vibration.cancel();
    if (autoDecline.current) clearTimeout(autoDecline.current);
    callTimer.current = setInterval(() => setCallSecs(s => s + 1), 1000);

    setTimeout(async () => {
      try {
        const info = await FileSystem.getInfoAsync(FAKE_CALL_VOICE_PATH);
        if (info.exists) {
          player.replace({ uri: FAKE_CALL_VOICE_PATH });
          player.play();
        } else {
          Speech.speak(DEFAULT_MESSAGE, { language: 'en-IN', rate: 0.85 });
        }
      } catch (e) {
        Speech.speak(DEFAULT_MESSAGE, { language: 'en-IN', rate: 0.85 });
      }
    }, 1000);
  };

  const decline = () => {
    Vibration.cancel();
    Speech.stop();
    player.pause();
    if (callTimer.current)   clearInterval(callTimer.current);
    if (autoDecline.current) clearTimeout(autoDecline.current);
    router.back();
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={S.container}>
      <StatusBar backgroundColor={Colors.callBg} barStyle="light-content" />

      <View style={S.avatar}>
        <Text style={S.avatarTxt}>{name.charAt(0).toUpperCase()}</Text>
      </View>

      <Text style={S.callerName}>{name}</Text>
      <Text style={S.callStatus}>
        {answered ? fmt(callSecs) : 'Incoming call...'}
      </Text>

      {answered && (
        <Text style={S.speakingNote}>🔊 Playing voice message...</Text>
      )}

      <View style={S.btnRow}>
        <View style={S.btnWrap}>
          <TouchableOpacity style={[S.callBtn, S.declineBtn]} onPress={decline}>
            <Text style={S.btnIcon}>✕</Text>
          </TouchableOpacity>
          <Text style={S.btnLabel}>{answered ? 'End' : 'Decline'}</Text>
        </View>

        {!answered && (
          <View style={S.btnWrap}>
            <TouchableOpacity style={[S.callBtn, S.answerBtn]} onPress={answer}>
              <Text style={S.btnIcon}>✓</Text>
            </TouchableOpacity>
            <Text style={S.btnLabel}>Answer</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.callBg, alignItems: 'center', paddingHorizontal: 32 },
  avatar:       { width: 110, height: 110, borderRadius: 55, backgroundColor: Colors.shieldPurple, justifyContent: 'center', alignItems: 'center', marginTop: 100, marginBottom: 24 },
  avatarTxt:    { fontSize: 50, fontWeight: 'bold', color: Colors.white },
  callerName:   { fontSize: 36, fontWeight: 'bold', color: Colors.white, marginBottom: 8 },
  callStatus:   { fontSize: 18, color: '#9E9E9E', marginBottom: 4 },
  speakingNote: { fontSize: 13, color: '#90CAF9', marginTop: 8 },
  btnRow:       { position: 'absolute', bottom: 80, flexDirection: 'row', justifyContent: 'center', gap: 80, width: '100%' },
  btnWrap:      { alignItems: 'center', gap: 10 },
  callBtn:      { width: 76, height: 76, borderRadius: 38, justifyContent: 'center', alignItems: 'center' },
  declineBtn:   { backgroundColor: Colors.declineRed },
  answerBtn:    { backgroundColor: Colors.answerGreen },
  btnIcon:      { fontSize: 30, fontWeight: 'bold', color: Colors.white },
  btnLabel:     { fontSize: 13, color: '#9E9E9E' },
});
