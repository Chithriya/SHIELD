import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, Switch, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAudioRecorder, useAudioPlayer, AudioModule, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../constants/colors';
import { storage } from '../services/StorageService';
import { shieldService } from '../services/ShieldService';

const FAKE_CALL_VOICE_PATH =
  (FileSystem.documentDirectory ?? '') + 'fake_call_voice.m4a';

const DEFAULT_MESSAGE =
  "I have received your alert. I'm on my way to help you. " +
  "Just stay calm and stay safe. I will be there in 5 minutes.";

export default function SettingsScreen() {
  const [voiceEnabled,  setVoiceEnabled]  = useState(true);
  const [smsFallback,   setSmsFallback]   = useState(true);
  const [volunteer,     setVolunteer]     = useState(false);
  const [voicePhrase,   setVoicePhrase]   = useState('');
  const [fakeCallName,  setFakeCallName]  = useState('');
  const [userName,      setUserName]      = useState('');
  const [userPhone,     setUserPhone]     = useState('');
  const [bloodGroup,    setBloodGroup]    = useState('');
  const [medicalNotes,  setMedicalNotes]  = useState('');
  const [isRecording,   setIsRecording]   = useState(false);
  const [hasCustomVoice,setHasCustomVoice]= useState(false);
  const [recordStatus,  setRecordStatus]  = useState('');

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(null);

  useFocusEffect(useCallback(() => {
    load();
    return () => {
      player.remove();
    };
  }, []));

  const load = async () => {
    setVoiceEnabled(await storage.getVoiceEnabled());
    setSmsFallback(await storage.getSmsFallback());
    setVolunteer(await storage.getVolunteerMode());
    setVoicePhrase(await storage.getVoicePhrase());
    setFakeCallName(await storage.getFakeCallName());
    setUserName(await storage.getUserName());
    setUserPhone(await storage.getUserPhone());
    setBloodGroup(await storage.getBloodGroup());
    setMedicalNotes(await storage.getMedicalNotes());
    const info = await FileSystem.getInfoAsync(FAKE_CALL_VOICE_PATH);
    setHasCustomVoice(info.exists);
    setRecordStatus(info.exists ? '✅ Custom voice is saved' : '');
  };

  const save = async () => {
    await storage.setVoiceEnabled(voiceEnabled);
    await storage.setSmsFallback(smsFallback);
    await storage.setVolunteerMode(volunteer);
    await storage.setVoicePhrase(voicePhrase.trim());

    if (fakeCallName.trim())  await storage.setFakeCallName(fakeCallName.trim());
    if (userName.trim())      await storage.setUserName(userName.trim());
    if (userPhone.trim())     await storage.setUserPhone(userPhone.trim());
    if (bloodGroup.trim())    await storage.setBloodGroup(bloodGroup.trim());
    if (medicalNotes.trim())  await storage.setMedicalNotes(medicalNotes.trim());

    if (!shieldService.isSosActive()) {
      await shieldService.restartVoice();
    }

    Alert.alert('Saved ✅', 'Settings saved successfully.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  // ── Fake call voice recording ────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Error', 'Could not start recording. Check microphone permission.');
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setRecordStatus('🔴 Recording... tap Stop when done');
    } catch (e) {
      Alert.alert('Error', 'Could not start recording. Check microphone permission.');
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setIsRecording(false);
      if (uri) {
        await FileSystem.copyAsync({ from: uri, to: FAKE_CALL_VOICE_PATH });
        setHasCustomVoice(true);
        setRecordStatus('✅ Custom voice saved successfully!');
        Alert.alert('Saved', 'Your custom voice message has been saved for the fake call.');
      }
    } catch (e) {
      setIsRecording(false);
      Alert.alert('Error', 'Could not save recording.');
    }
  };

  const playPreview = async () => {
    try {
      player.replace({ uri: FAKE_CALL_VOICE_PATH });
      player.play();
      setRecordStatus('🔊 Playing preview...');
    } catch (e) {
      Alert.alert('Error', 'Could not play recording.');
    }
  };

  const deleteCustomVoice = async () => {
    Alert.alert('Delete Custom Voice?', 'Default message will be used instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await FileSystem.deleteAsync(FAKE_CALL_VOICE_PATH, { idempotent: true });
          setHasCustomVoice(false);
          setRecordStatus('');
        },
      },
    ]);
  };

  const resetOnboarding = () => {
    Alert.alert('Reset SHIELD?', 'This will clear all data and restart setup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive',
        onPress: async () => {
          await storage.setOnboarded(false);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const Row = ({
    title, sub, val, onChange,
  }: { title: string; sub: string; val: boolean; onChange: (v: boolean) => void }) => (
    <View style={S.row}>
      <View style={{ flex: 1 }}>
        <Text style={S.rowTitle}>{title}</Text>
        <Text style={S.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={val}
        onValueChange={onChange}
        trackColor={{ true: Colors.shieldPurple, false: Colors.border }}
        thumbColor={Colors.white}
      />
    </View>
  );

  return (
    <ScrollView style={S.container} contentContainerStyle={S.content}>

      {/* Profile */}
      <Text style={S.section}>YOUR PROFILE</Text>
      <View style={S.card}>
        <Text style={S.label}>Full name</Text>
        <TextInput style={S.input} value={userName} onChangeText={setUserName}
          placeholder="Your name" placeholderTextColor={Colors.textSecondary} />
        <Text style={S.label}>Phone number</Text>
        <TextInput style={S.input} value={userPhone} onChangeText={setUserPhone}
          placeholder="Your phone" keyboardType="phone-pad"
          placeholderTextColor={Colors.textSecondary} />
        <Text style={S.label}>Blood group</Text>
        <TextInput style={S.input} value={bloodGroup} onChangeText={setBloodGroup}
          placeholder="e.g. O+" placeholderTextColor={Colors.textSecondary} />
        <Text style={S.label}>Medical notes</Text>
        <TextInput style={[S.input, { height: 70 }]} value={medicalNotes}
          onChangeText={setMedicalNotes} multiline
          placeholder="Allergies, conditions..."
          placeholderTextColor={Colors.textSecondary} />
      </View>

      {/* AI Voice Trigger */}
      <Text style={S.section}>AI VOICE TRIGGER</Text>
      <View style={S.card}>
        <Row
          title="Voice trigger enabled"
          sub="SHIELD listens for your secret phrase in background"
          val={voiceEnabled}
          onChange={setVoiceEnabled}
        />
        <View style={S.divider} />
        <Text style={S.label}>YOUR SECRET TRIGGER PHRASE</Text>
        <TextInput
          style={[S.input, { height: 70 }]}
          value={voicePhrase}
          onChangeText={setVoicePhrase}
          multiline
          placeholder="e.g. I am Riya I am in danger"
          placeholderTextColor={Colors.textSecondary}
        />
        <View style={S.hintBox}>
          <Text style={S.hintTitle}>💡 How voice trigger works</Text>
          <Text style={S.hintText}>1. Say your secret phrase out loud</Text>
          <Text style={S.hintText}>2. SHIELD detects it automatically</Text>
          <Text style={S.hintText}>3. SOS fires + SMS sent — no button needed</Text>
          <Text style={S.hintText}>4. Works even when phone is locked</Text>
        </View>
      </View>

      {/* Fake Call */}
      <Text style={S.section}>FAKE CALL</Text>
      <View style={S.card}>
        <Text style={S.label}>CALLER NAME</Text>
        <TextInput style={S.input} value={fakeCallName} onChangeText={setFakeCallName}
          placeholder="e.g. Amma" placeholderTextColor={Colors.textSecondary} />

        <View style={S.divider} />

        <Text style={S.label}>VOICE MESSAGE WHEN CALL IS ANSWERED</Text>
        <View style={S.defaultMsgBox}>
          <Text style={S.defaultMsgLabel}>Default message:</Text>
          <Text style={S.defaultMsgText}>"{DEFAULT_MESSAGE}"</Text>
        </View>

        {recordStatus !== '' && (
          <Text style={S.recordStatus}>{recordStatus}</Text>
        )}

        <View style={S.voiceBtns}>
          {!isRecording ? (
            <TouchableOpacity style={S.recordBtn} onPress={startRecording}>
              <Text style={S.recordBtnTxt}>🎙 Record Custom Voice</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={S.stopBtn} onPress={stopRecording}>
              <Text style={S.stopBtnTxt}>⏹ Stop Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {hasCustomVoice && (
          <View style={S.voiceBtns}>
            <TouchableOpacity style={S.previewBtn} onPress={playPreview}>
              <Text style={S.previewBtnTxt}>▶ Preview Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.deleteBtn} onPress={deleteCustomVoice}>
              <Text style={S.deleteBtnTxt}>🗑 Delete Custom</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={S.hint}>
          Record your own voice message to play when fake call is answered.
          If no custom voice is recorded, the default message will be used.
        </Text>
      </View>

      {/* Alerts */}
      <Text style={S.section}>ALERTS & NETWORK</Text>
      <View style={S.card}>
        <Row
          title="SMS fallback"
          sub="Send SMS even without internet"
          val={smsFallback}
          onChange={setSmsFallback}
        />
        <View style={S.divider} />
        <Row
          title="Volunteer alerts"
          sub="Alert verified volunteers within 500m"
          val={volunteer}
          onChange={setVolunteer}
        />
      </View>

      {/* Save */}
      <TouchableOpacity style={S.saveBtn} onPress={save}>
        <Text style={S.saveTxt}>Save Settings</Text>
      </TouchableOpacity>

      {/* Reset */}
      <TouchableOpacity style={S.resetBtn} onPress={resetOnboarding}>
        <Text style={S.resetTxt}>Reset & Restart Setup</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const S = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.background },
  content:         { padding: 16, paddingBottom: 40 },
  section:         { fontSize: 11, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 8, marginTop: 18 },
  card:            { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  row:             { flexDirection: 'row', alignItems: 'center' },
  rowTitle:        { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary },
  rowSub:          { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  divider:         { height: 1, backgroundColor: Colors.border, marginVertical: 14 },
  label:           { fontSize: 12, fontWeight: 'bold', color: Colors.textSecondary, marginBottom: 6, letterSpacing: 0.5 },
  input:           { backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 4 },
  hintBox:         { backgroundColor: Colors.shieldPurpleLight, borderRadius: 8, padding: 12, marginTop: 8 },
  hintTitle:       { fontSize: 12, fontWeight: 'bold', color: Colors.shieldPurple, marginBottom: 6 },
  hintText:        { fontSize: 12, color: Colors.shieldPurpleDark, marginBottom: 3, lineHeight: 18 },
  hint:            { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 8 },
  defaultMsgBox:   { backgroundColor: Colors.background, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  defaultMsgLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  defaultMsgText:  { fontSize: 13, color: Colors.textPrimary, lineHeight: 20, fontStyle: 'italic' },
  recordStatus:    { fontSize: 13, color: Colors.safeGreen, marginBottom: 10, fontWeight: '600' },
  voiceBtns:       { flexDirection: 'row', gap: 10, marginBottom: 10 },
  recordBtn:       { flex: 1, backgroundColor: Colors.shieldPurple, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  recordBtnTxt:    { color: Colors.white, fontWeight: '600', fontSize: 13 },
  stopBtn:         { flex: 1, backgroundColor: Colors.sosRed, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  stopBtnTxt:      { color: Colors.white, fontWeight: '600', fontSize: 13 },
  previewBtn:      { flex: 1, backgroundColor: Colors.safeGreen, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  previewBtnTxt:   { color: Colors.white, fontWeight: '600', fontSize: 13 },
  deleteBtn:       { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.sosRed },
  deleteBtnTxt:    { color: Colors.sosRed, fontWeight: '600', fontSize: 13 },
  saveBtn:         { backgroundColor: Colors.shieldPurple, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveTxt:         { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
  resetBtn:        { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: Colors.sosRed },
  resetTxt:        { color: Colors.sosRed, fontSize: 14, fontWeight: '600' },
});
