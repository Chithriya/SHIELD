// src/screens/MainScreen.tsx
// UPDATED: Added Live Tracking + Nearby Services (Hospital Locator) to nav grid

import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  StyleSheet, ScrollView, StatusBar, Vibration,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../constants/colors';
import { storage } from '../services/StorageService';
import { shieldService } from '../services/ShieldService';
import { AlertEvent } from '../constants/types';

export default function MainScreen() {
  const [userName,     setUserName]     = useState('');
  const [fakeCallName, setFakeCallName] = useState('Amma');
  const [contactCount, setContactCount] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voicePhrase,  setVoicePhrase]  = useState('');
  const [countdown,    setCountdown]    = useState(0);

  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;

    const init = async () => {
      const [uName, fName, contacts, vEnabled, vPhrase] = await Promise.all([
        storage.getUserName(),
        storage.getFakeCallName(),
        storage.getContacts(),
        storage.getVoiceEnabled(),
        storage.getVoicePhrase(),
      ]);
      if (!mounted) return;
      setUserName(uName);
      setFakeCallName(fName);
      setContactCount(contacts.length);
      setVoiceEnabled(vEnabled);
      setVoicePhrase(vPhrase);

      if (!shieldService.isInitialized()) {
        await shieldService.initialize((alert: AlertEvent) => {
          router.push({
            pathname: '/alert',
            params: {
              triggerType: alert.triggerType,
              lat: String(alert.latitude),
              lng: String(alert.longitude),
            },
          });
        });
      }
    };

    init();
    return () => { mounted = false; };
  }, []));

  // ── SOS: 3-second hold for instant, tap for confirm dialog ───────────────
  const startHoldCountdown = () => {
    if (countdown > 0) return;
    let count = 3;
    setCountdown(count);
    Vibration.vibrate(100);
    countdownTimer.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      Vibration.vibrate(80);
      if (count <= 0) {
        stopHoldCountdown();
        triggerSOS();
      }
    }, 1000);
  };

  const stopHoldCountdown = () => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    setCountdown(0);
  };

  const handleSOSTap = () => {
    if (countdown > 0) return;
    Alert.alert(
      '🆘 Send SOS Alert?',
      `SMS will be sent to all ${contactCount} emergency contact${contactCount !== 1 ? 's' : ''} with your live GPS location.\n\nHold the button for 3 seconds to skip this dialog.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS Now', style: 'destructive', onPress: triggerSOS },
      ],
    );
  };

  const triggerSOS = async () => {
    try {
      await shieldService.triggerSOS('MANUAL');
    } catch (e) {
      console.warn('[SHIELD] triggerSOS error:', e);
    }
  };

  const openFakeCall = async () => {
    const name = await storage.getFakeCallName();
    router.push({ pathname: '/fakecall', params: { callerName: name || 'Amma' } });
  };

  // ── Nav grid — UPDATED with Live Tracking + Nearby Services ─────────────
  const navItems = [
    { icon: '👥', label: 'Contacts',        route: '/contacts'       as const },
    { icon: '🗺️',  label: 'Police Locator',  route: '/policelocator'  as const },
    { icon: '☎️',  label: 'Helplines',        route: '/helplines'      as const },
    { icon: '🏥', label: 'Nearby Services',  route: '/nearbyservices' as const },
    { icon: '📍', label: 'Live Tracking',   route: '/livetracking'   as const },
    { icon: '🗂️',  label: 'Evidence',        route: '/evidence'       as const },
    { icon: '⚙️',  label: 'Settings',        route: '/settings'       as const },
  ];

  const voiceOn = voiceEnabled && !!voicePhrase;
  const greeting = userName ? `Hello, ${userName.split(' ')[0]}` : 'SHIELD Active';

  return (
    <View style={S.root}>
      <StatusBar backgroundColor={Colors.shieldPurple} barStyle="light-content" />

      {/* ── Header ── */}
      <View style={S.header}>
        <View>
          <Text style={S.greeting}>{greeting} 👋</Text>
          <Text style={S.tagline}>You are protected</Text>
        </View>
        <View style={S.statusPill}>
          <View style={[S.dot, { backgroundColor: voiceOn ? Colors.safeGreen : '#FF8F00' }]} />
          <Text style={S.statusTxt}>{voiceOn ? 'Voice On' : 'Voice Off'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>

        {/* ── SOS Button ── */}
        <View style={S.sosWrap}>
          <Text style={S.sosHint}>Tap to confirm  •  Hold 3 s for instant SOS</Text>
          <TouchableOpacity
            style={S.sosBtn}
            onPress={handleSOSTap}
            onLongPress={startHoldCountdown}
            onPressOut={stopHoldCountdown}
            activeOpacity={0.85}
            delayLongPress={300}>
            {countdown > 0 ? (
              <Text style={S.sosCountdown}>{countdown}</Text>
            ) : (
              <>
                <Text style={S.sosIcon}>🆘</Text>
                <Text style={S.sosTxt}>SOS</Text>
                <Text style={S.sosSubTxt}>EMERGENCY</Text>
              </>
            )}
          </TouchableOpacity>
          {countdown > 0 && (
            <Text style={S.holdMsg}>Sending in {countdown}s — release to cancel</Text>
          )}
        </View>

        {/* ── Info strip ── */}
        <View style={S.infoStrip}>
          <View style={S.infoItem}>
            <Text style={S.infoVal}>{contactCount}</Text>
            <Text style={S.infoLbl}>Contacts</Text>
          </View>
          <View style={S.infoDivider} />
          <View style={S.infoItem}>
            <Text style={S.infoVal}>112</Text>
            <Text style={S.infoLbl}>Police</Text>
          </View>
          <View style={S.infoDivider} />
          <View style={S.infoItem}>
            <Text style={S.infoVal}>{voiceOn ? '🟢' : '🟡'}</Text>
            <Text style={S.infoLbl}>Voice AI</Text>
          </View>
          <View style={S.infoDivider} />
          <View style={S.infoItem}>
            <Text style={S.infoVal}>108</Text>
            <Text style={S.infoLbl}>Ambulance</Text>
          </View>
        </View>

        {/* ── Quick Action Buttons ── */}
        <View style={S.quickRow}>
          <TouchableOpacity style={S.fakeCallBtn} onPress={openFakeCall}>
            <Text style={S.fakeCallIcon}>📞</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.fakeCallTitle}>Fake Call — Escape Danger</Text>
              <Text style={S.fakeCallSub}>Caller: {fakeCallName}</Text>
            </View>
            <Text style={S.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Voice trigger card ── */}
        <View style={[S.voiceCard, voiceOn ? S.voiceCardOn : S.voiceCardOff]}>
          <Text style={S.voiceCardTitle}>
            {voiceOn ? '🎤 Voice Trigger Active' : '🎤 Voice Trigger Off'}
          </Text>
          <Text style={S.voiceCardSub}>
            {voiceOn
              ? `Say: "${voicePhrase}" to send SOS automatically`
              : 'Set a phrase in Settings to enable hands-free SOS'}
          </Text>
        </View>

        {/* ── Navigation grid ── */}
        <Text style={S.sectionLabel}>FEATURES</Text>
        <View style={S.grid}>
          {navItems.map(item => (
            <TouchableOpacity
              key={item.route}
              style={S.gridItem}
              onPress={() => router.push(item.route)}>
              <Text style={S.gridIcon}>{item.icon}</Text>
              <Text style={S.gridLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background },

  header:        { backgroundColor: Colors.shieldPurple, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  greeting:      { fontSize: 20, fontWeight: 'bold', color: Colors.white },
  tagline:       { fontSize: 13, color: '#CECBF6', marginTop: 2 },
  statusPill:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  statusTxt:     { fontSize: 12, color: Colors.white, fontWeight: '600' },

  content:       { padding: 20, paddingBottom: 40 },

  sosWrap:       { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  sosHint:       { fontSize: 12, color: Colors.textSecondary, marginBottom: 16 },
  sosBtn:        { width: 190, height: 190, borderRadius: 95, backgroundColor: Colors.sosRed, justifyContent: 'center', alignItems: 'center', elevation: 12, shadowColor: Colors.sosRed, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12, borderWidth: 5, borderColor: '#FFEBEE' },
  sosIcon:       { fontSize: 48, marginBottom: 2 },
  sosTxt:        { fontSize: 36, fontWeight: 'bold', color: Colors.white, letterSpacing: 4 },
  sosSubTxt:     { fontSize: 12, color: '#FFCDD2', letterSpacing: 2 },
  sosCountdown:  { fontSize: 72, fontWeight: 'bold', color: Colors.white },
  holdMsg:       { marginTop: 14, fontSize: 13, color: Colors.sosRed, fontWeight: '600', textAlign: 'center' },

  infoStrip:     { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 16, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  infoItem:      { flex: 1, alignItems: 'center' },
  infoVal:       { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  infoLbl:       { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  infoDivider:   { width: 1, backgroundColor: Colors.border },

  quickRow:      { marginBottom: 14 },
  fakeCallBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  fakeCallIcon:  { fontSize: 28, marginRight: 12 },
  fakeCallTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  fakeCallSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  arrow:         { fontSize: 24, color: Colors.textSecondary },

  voiceCard:     { borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1 },
  voiceCardOn:   { backgroundColor: '#E8F5E9', borderColor: Colors.safeGreen },
  voiceCardOff:  { backgroundColor: '#FFF3E0', borderColor: Colors.amber },
  voiceCardTitle:{ fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  voiceCardSub:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  sectionLabel:  { fontSize: 11, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem:      { width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  gridIcon:      { fontSize: 28, marginBottom: 6 },
  gridLabel:     { fontSize: 11, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
});
