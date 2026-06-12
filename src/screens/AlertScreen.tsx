import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  StyleSheet, BackHandler, StatusBar, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../constants/colors';
import { shieldService } from '../services/ShieldService';
import { getMapsLink, locationService } from '../services/LocationService';
import { TriggerType } from '../constants/types';

function getEvidenceDir(): string {
  return (FileSystem.documentDirectory ?? '') + 'evidence/';
}

export default function AlertScreen() {
  const params      = useLocalSearchParams();
  const triggerType = (params.triggerType as TriggerType) ?? 'MANUAL';
  const initLat     = parseFloat((params.lat as string) ?? '0');
  const initLng     = parseFloat((params.lng as string) ?? '0');

  const [seconds,       setSeconds]       = useState(0);
  const [contacts,      setContacts]      = useState(0);
  const [liveLat,       setLiveLat]       = useState(initLat);
  const [liveLng,       setLiveLng]       = useState(initLng);
  const [photosTaken,   setPhotosTaken]   = useState(0);
  const [audioSaved,    setAudioSaved]    = useState(false);
  const [cameraFacing,  setCameraFacing]  = useState<'front' | 'back'>('front');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const audioRecorder   = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef       = useRef<CameraView>(null);
  const facingRef       = useRef<'front' | 'back'>('front');
  const photoTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoCount      = useRef(0);
  const photoInProgress = useRef(false);
  const cameraReadyRef  = useRef(false);
  // Keep a stable ref to handleCancel so BackHandler always gets the latest version
  const handleCancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    loadContacts();
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

    const unsubscribe = locationService.subscribeToLocation((lat, lng) => {
      setLiveLat(lat);
      setLiveLng(lng);
    });

    startAudioRecording();
    requestCameraPermission();

    const firstPhotoTimer = setTimeout(() => takePhoto(), 8000);
    photoTimer.current = setInterval(() => takePhoto(), 30000);

    // Use ref so BackHandler always calls the latest handleCancel
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancelRef.current();
      return true;
    });

    return () => {
      clearTimeout(firstPhotoTimer);
      if (timerRef.current)   clearInterval(timerRef.current);
      if (photoTimer.current) clearInterval(photoTimer.current);
      unsubscribe();
      back.remove();
    };
  }, []);

  const loadContacts = async () => {
    const { storage } = require('../services/StorageService');
    const c = await storage.getContacts();
    setContacts(c.length);
  };

  const startAudioRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        console.warn('[SHIELD] Microphone permission denied');
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      console.log('[SHIELD] Audio recording started');
    } catch (e) {
      console.warn('[SHIELD] Audio recording error:', e);
    }
  };

  const stopAudioRecording = async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (uri) {
        const dir = getEvidenceDir();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        const fileName = `audio_${Date.now()}.m4a`;
        await FileSystem.moveAsync({ from: uri, to: dir + fileName });
        setAudioSaved(true);
        console.log('[SHIELD] ✅ Audio saved:', fileName);
      }
    } catch (e) {
      console.warn('[SHIELD] stopAudioRecording error:', e);
    }
  };

  const takePhoto = async () => {
    if (photoInProgress.current) return;
    if (!cameraReadyRef.current) {
      console.log('[SHIELD] Camera not ready yet, skipping photo');
      return;
    }
    photoInProgress.current = true;

    try {
      if (!cameraRef.current) return;

      const photo = await cameraRef.current.takePictureAsync({
        quality:        0.7,
        base64:         false,
        skipProcessing: true,
      });

      if (photo?.uri) {
        const dir     = getEvidenceDir();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        const facingTag = facingRef.current;
        const fileName  = `photo_${facingTag}_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: photo.uri, to: dir + fileName });
        photoCount.current += 1;
        setPhotosTaken(photoCount.current);
        console.log('[SHIELD] ✅ Photo saved:', fileName);
      }

      const next = facingRef.current === 'front' ? 'back' : 'front';
      facingRef.current = next;
      setCameraFacing(next);
      cameraReadyRef.current = false;

    } catch (e) {
      console.warn('[SHIELD] takePhoto error:', e);
    } finally {
      photoInProgress.current = false;
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel SOS?', 'Are you safe? This will stop the alert.', [
      { text: 'No, keep active', style: 'cancel' },
      {
        text: 'Yes, I am safe',
        onPress: () => {
          // Stop local timers immediately
          if (timerRef.current)   clearInterval(timerRef.current);
          if (photoTimer.current) clearInterval(photoTimer.current);

          // Navigate away first so the screen never hangs
          router.replace('/main');

          // Cleanup runs in background after navigation
          (async () => {
            try { await stopAudioRecording(); } catch {}
            try { await shieldService.cancelSOS(); } catch {}
          })();
        },
      },
    ]);
  };

  // Keep ref in sync with latest handleCancel on every render
  handleCancelRef.current = handleCancel;

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const mapsLink = getMapsLink(liveLat, liveLng);

  return (
    <View style={S.container}>
      <StatusBar backgroundColor={Colors.sosRedDark} barStyle="light-content" />

      {cameraPermission?.granted && (
        <CameraView
          ref={cameraRef}
          style={S.hiddenCamera}
          facing={cameraFacing}
          pointerEvents="none"
          onCameraReady={() => {
            cameraReadyRef.current = true;
            console.log('[SHIELD] Camera ready, facing:', facingRef.current);
          }}
        />
      )}

      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.title}>🆘 SOS ALERT ACTIVE</Text>
        <Text style={S.trigger}>Triggered by: {triggerType.replace(/_/g, ' ')}</Text>
        <Text style={S.timer}>{fmt(seconds)}</Text>

        <View style={S.card}>
          <Text style={S.cardTitle}>ALERT STATUS</Text>

          <View style={S.statusRow}>
            <Text style={S.statusIcon}>✅</Text>
            <Text style={S.statusText}>
              {contacts} contact{contacts !== 1 ? 's' : ''} notified via SMS
            </Text>
          </View>
          <View style={S.statusRow}>
            <Text style={S.statusIcon}>📍</Text>
            <Text style={S.statusText}>Live GPS tracking — SMS every 1 min</Text>
          </View>
          <View style={S.statusRow}>
            <Text style={S.statusIcon}>🎙️</Text>
            <Text style={S.statusText}>
              {audioSaved ? 'Audio evidence saved ✅' : 'Audio recording in progress...'}
            </Text>
          </View>
          <View style={S.statusRow}>
            <Text style={S.statusIcon}>📸</Text>
            <Text style={S.statusText}>
              {photosTaken > 0
                ? `${photosTaken} photo${photosTaken > 1 ? 's' : ''} captured (front + back)`
                : cameraPermission?.granted
                  ? 'Camera capturing evidence...'
                  : 'Camera permission not granted'}
            </Text>
          </View>

          <View style={S.divider} />

          <Text style={S.coordsLabel}>LIVE LOCATION</Text>
          <Text style={S.coords}>{liveLat.toFixed(5)}, {liveLng.toFixed(5)}</Text>
          <Text style={S.mapsLink}>{mapsLink}</Text>
        </View>

        <TouchableOpacity style={S.cancelBtn} onPress={handleCancel}>
          <Text style={S.cancelTxt}>I AM SAFE — Cancel SOS</Text>
        </TouchableOpacity>

        <Text style={S.note}>
          Audio + photo evidence being recorded automatically.{'\n'}
          Location SMS sent every 1 minute.{'\n'}
          Do not close the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.sosRed },
  hiddenCamera: { width: 1, height: 1, position: 'absolute', opacity: 0 },
  content:      { padding: 24, paddingBottom: 40, alignItems: 'center' },
  title:        { fontSize: 26, fontWeight: 'bold', color: Colors.white, textAlign: 'center', marginTop: 20, marginBottom: 6 },
  trigger:      { fontSize: 14, color: '#FFCDD2', textAlign: 'center', marginBottom: 8 },
  timer:        { fontSize: 52, fontWeight: 'bold', color: Colors.white, textAlign: 'center', marginBottom: 24, letterSpacing: 4 },
  card:         { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 16, padding: 20, width: '100%', marginBottom: 28 },
  cardTitle:    { fontSize: 11, fontWeight: 'bold', color: '#EF9A9A', letterSpacing: 1.5, marginBottom: 14 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statusIcon:   { fontSize: 16, marginRight: 10 },
  statusText:   { fontSize: 14, color: Colors.white, flex: 1 },
  divider:      { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 14 },
  coordsLabel:  { fontSize: 11, color: '#BDBDBD', letterSpacing: 1, marginBottom: 4 },
  coords:       { fontSize: 14, color: Colors.white, marginBottom: 4 },
  mapsLink:     { fontSize: 11, color: '#90CAF9' },
  cancelBtn:    { backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 18, alignItems: 'center', width: '100%' },
  cancelTxt:    { color: Colors.sosRed, fontSize: 16, fontWeight: 'bold' },
  note:         { marginTop: 16, fontSize: 12, color: '#FFCDD2', textAlign: 'center', lineHeight: 20 },
});
