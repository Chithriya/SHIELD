import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, KeyboardAvoidingView,
  Platform, Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { requestCameraPermissionsAsync } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { getContactsAsync, Fields, requestPermissionsAsync } from 'expo-contacts';
import { Colors } from '../constants/colors';
import { storage } from '../services/StorageService';
import { EmergencyContact } from '../constants/types';

// ── Contacts for 3 slots ────────────────────────────────────────────────────
interface ContactSlot { name: string; phone: string; }

// Simple shape for the picker list (fullName + phones from getAllDetails)
interface PickerContact {
  id: string;
  fullName: string | null;
  phones: { id: string; label?: string; number?: string }[];
}
export default function OnboardingScreen() {
  const [step,        setStep]       = useState(0);
  const [name,        setName]       = useState('');
  const [phone,       setPhone]      = useState('');
  const [blood,       setBlood]      = useState('');
  const [medical,     setMedical]    = useState('');
  const [slots,       setSlots]      = useState<ContactSlot[]>([
    { name: '', phone: '' },
    { name: '', phone: '' },
    { name: '', phone: '' },
  ]);
  const [voicePhrase, setVoicePhrase] = useState('');
  const [fakeCall,    setFakeCall]   = useState('Amma');

  // ── Phone book picker state ─────────────────────────────────────────────
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [pickerSlotIdx, setPickerSlotIdx] = useState(0);
  const [allContacts,   setAllContacts]   = useState<PickerContact[]>([]);
  const [search,        setSearch]        = useState('');

  // ── STEP 0: Permissions ─────────────────────────────────────────────────
  const grantPermissions = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {}
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {}
    try {
      await requestCameraPermissionsAsync();
    } catch {}
    try {
      const { requestRecordingPermissionsAsync } = require('expo-audio');
      await requestRecordingPermissionsAsync();
    } catch {}
    try {
      await Notifications.requestPermissionsAsync();
    } catch {}
    setStep(1);
  };

  // ── STEP 1: Profile ─────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!name.trim())  return Alert.alert('Required', 'Please enter your name.');
    if (!phone.trim()) return Alert.alert('Required', 'Please enter your phone number.');
    await storage.setUserName(name.trim());
    await storage.setUserPhone(phone.trim());
    await storage.setBloodGroup(blood.trim());
    await storage.setMedicalNotes(medical.trim());
    setStep(2);
  };

  // ── STEP 2: Contacts – phone book picker ────────────────────────────────
  const openPickerForSlot = async (idx: number) => {
    try {
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Allow contact access so you can pick from your phone book.',
        );
        return;
      }

      // expo-contacts 56.x: use getContactsAsync with Fields
      const result = await getContactsAsync({
        fields: [Fields.Name, Fields.PhoneNumbers],
      });
      const data = result.data;

      const withPhone: PickerContact[] = data
        .filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map(c => ({
          id:       c.id ?? String(Math.random()),
          fullName: c.name ?? null,
          phones:   (c.phoneNumbers ?? []).map(p => ({ id: p.id ?? '', label: p.label, number: p.number })),
        }));

      setAllContacts(withPhone);
      setSearch('');
      setPickerSlotIdx(idx);
      setPickerOpen(true);
    } catch (e) {
      Alert.alert('Error', 'Could not load contacts. Please enter manually.');
    }
  };

  const applyContact = (contact: PickerContact) => {
    const phones = contact.phones ?? [];
    if (phones.length === 0) return;

    const doApply = (num: string) => {
      const updated = slots.map((s, i) =>
        i === pickerSlotIdx ? { name: contact.fullName ?? '', phone: num } : s,
      );
      setSlots(updated);
      setPickerOpen(false);
    };

    if (phones.length === 1) {
      doApply(phones[0].number ?? '');
    } else {
      Alert.alert(
        `Choose number for ${contact.fullName}`,
        '',
        phones
          .map(p => ({
            text: `${p.label ? p.label + ': ' : ''}${p.number}`,
            onPress: () => doApply(p.number ?? ''),
          }))
          .concat([{ text: 'Cancel', style: 'cancel' } as any]),
      );
      setPickerOpen(false);
    }
  };

  const updateSlot = (idx: number, field: 'name' | 'phone', val: string) => {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
  };

  const saveContacts = async () => {
    const filled = slots.filter(s => s.name.trim() && s.phone.trim());
    if (filled.length === 0)
      return Alert.alert('Required', 'Add at least one emergency contact.');

    const contacts: EmergencyContact[] = filled.map((s, i) => ({
      id:        String(i + 1),
      name:      s.name.trim(),
      phone:     s.phone.trim(),
      relation:  'Family',
      isPrimary: i === 0,
    }));
    await storage.saveContacts(contacts);
    setStep(3);
  };

  // ── STEP 3: Voice ───────────────────────────────────────────────────────
  const saveVoice = async () => {
    if (!voicePhrase.trim())
      return Alert.alert(
        'Required',
        'Enter your secret voice trigger phrase.\n\nExample: "I am Riya I am in danger"',
      );
    await storage.setVoicePhrase(voicePhrase.trim());
    await storage.setFakeCallName(fakeCall.trim() || 'Amma');
    setStep(4);
  };

  // ── STEP 4: Done ────────────────────────────────────────────────────────
  const finish = async () => {
    await storage.setOnboarded(true);
    router.replace('/main');
  };

  const filteredContacts = allContacts.filter(c =>
    (c.fullName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={S.container}
        contentContainerStyle={S.content}
        keyboardShouldPersistTaps="handled">

        {/* ── STEP 0: Welcome ──────────────────────────────────────────── */}
        {step === 0 && (
          <View>
            <View style={S.logoWrap}>
              <View style={S.shieldIcon}>
                <Text style={S.shieldIconText}>🛡️</Text>
              </View>
              <Text style={S.bigTitle}>SHIELD</Text>
              <Text style={S.tagline}>Smart Women Safety App</Text>
            </View>
            <Text style={S.subtitle}>
              Your intelligent AI-powered safety companion.{'\n'}
              Protects you even when you cannot act.
            </Text>
            <View style={S.featureBox}>
              <Text style={S.sectionLabel}>WHAT SHIELD DOES FOR YOU</Text>
              {[
                ['🆘', 'One-tap SOS with live GPS sharing'],
                ['🎤', 'AI voice trigger — say a phrase to alert'],
                ['📍', 'Live location tracking during emergency'],
                ['📸', 'Auto photo + audio evidence capture'],
                ['📱', 'Silent SMS to family + police (112)'],
                ['📞', 'Fake call to escape danger safely'],
                ['🚔', 'Nearby police station locator'],
                ['☎️', 'Emergency helplines directory'],
              ].map(([icon, text]) => (
                <View key={text} style={S.featureRow}>
                  <Text style={S.featureIcon}>{icon}</Text>
                  <Text style={S.featureItem}>{text}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={S.btn} onPress={grantPermissions}>
              <Text style={S.btnText}>Grant Permissions & Continue →</Text>
            </TouchableOpacity>
            <Text style={S.permNote}>
              Location, Camera, Microphone and Notifications are needed for SOS features.
            </Text>
          </View>
        )}

        {/* ── STEP 1: Profile ──────────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <TouchableOpacity onPress={() => setStep(0)}>
              <Text style={S.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={S.stepBadge}>Step 1 of 3</Text>
            <Text style={S.title}>Your Profile</Text>
            <Text style={S.subtitle}>Stored only on your device. Never uploaded.</Text>

            <Text style={S.label}>Full Name *</Text>
            <TextInput style={S.input} value={name} onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={Colors.textSecondary} />

            <Text style={S.label}>Phone Number *</Text>
            <TextInput style={S.input} value={phone} onChangeText={setPhone}
              placeholder="+91 9876543210" keyboardType="phone-pad"
              placeholderTextColor={Colors.textSecondary} />

            <Text style={S.label}>Blood Group</Text>
            <TextInput style={S.input} value={blood} onChangeText={setBlood}
              placeholder="e.g. O+"
              placeholderTextColor={Colors.textSecondary} />

            <Text style={S.label}>Medical Notes (optional)</Text>
            <TextInput style={[S.input, { height: 80 }]} value={medical}
              onChangeText={setMedical} multiline
              placeholder="Allergies, conditions, medications..."
              placeholderTextColor={Colors.textSecondary} />

            <TouchableOpacity style={S.btn} onPress={saveProfile}>
              <Text style={S.btnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Contacts ─────────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <TouchableOpacity onPress={() => setStep(1)}>
              <Text style={S.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={S.stepBadge}>Step 2 of 3</Text>
            <Text style={S.title}>Emergency Contacts</Text>
            <Text style={S.subtitle}>
              They receive automatic SMS alerts on SOS.{'\n'}
              Police (112) is always included by default.
            </Text>

            <View style={S.policeBox}>
              <Text style={S.policeText}>🚔  Police 112 — added automatically</Text>
            </View>

            {slots.map((slot, idx) => (
              <View key={idx} style={S.slotBox}>
                <View style={S.slotHeader}>
                  <Text style={[S.label, { marginBottom: 0, marginTop: 0 }]}>
                    {idx === 0 ? 'CONTACT 1 (PRIMARY) *' : `CONTACT ${idx + 1} (OPTIONAL)`}
                  </Text>
                  <TouchableOpacity
                    style={S.pickBtn}
                    onPress={() => openPickerForSlot(idx)}>
                    <Text style={S.pickBtnTxt}>📒 +</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={S.input}
                  value={slot.name}
                  onChangeText={v => updateSlot(idx, 'name', v)}
                  placeholder="Full name"
                  placeholderTextColor={Colors.textSecondary}
                />
                <TextInput
                  style={S.input}
                  value={slot.phone}
                  onChangeText={v => updateSlot(idx, 'phone', v)}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            ))}

            <TouchableOpacity style={S.btn} onPress={saveContacts}>
              <Text style={S.btnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: Voice Trigger ────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <TouchableOpacity onPress={() => setStep(2)}>
              <Text style={S.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={S.stepBadge}>Step 3 of 3</Text>
            <Text style={S.title}>AI Voice Trigger</Text>
            <Text style={S.subtitle}>
              Set a secret phrase. When you say this, SHIELD automatically
              sends SOS — even if your phone is locked.
            </Text>
            <View style={S.voiceBox}>
              <Text style={S.voiceBoxTitle}>💡 Tips for a good trigger phrase</Text>
              <Text style={S.voiceBoxText}>• Make it natural, like something you'd say</Text>
              <Text style={S.voiceBoxText}>• Include your name so it's unique</Text>
              <Text style={S.voiceBoxText}>• At least 5 words long</Text>
              <Text style={S.voiceBoxText}>• Example: "I am Riya I am in danger"</Text>
            </View>
            <Text style={S.label}>YOUR SECRET VOICE TRIGGER PHRASE *</Text>
            <TextInput style={[S.input, { height: 80 }]} value={voicePhrase}
              onChangeText={setVoicePhrase} multiline
              placeholder='e.g. I am Riya I am in danger'
              placeholderTextColor={Colors.textSecondary} />

            <Text style={[S.label, { marginTop: 16 }]}>FAKE CALL NAME</Text>
            <Text style={[S.subtitle, { marginBottom: 8, marginTop: 0 }]}>
              Name shown when you trigger a fake incoming call.
            </Text>
            <TextInput style={S.input} value={fakeCall} onChangeText={setFakeCall}
              placeholder="e.g. Amma"
              placeholderTextColor={Colors.textSecondary} />

            <TouchableOpacity style={S.btn} onPress={saveVoice}>
              <Text style={S.btnText}>Finish Setup →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 4: Done ─────────────────────────────────────────────── */}
        {step === 4 && (
          <View style={{ alignItems: 'center', paddingTop: 20 }}>
            <Text style={S.doneIcon}>✅</Text>
            <Text style={[S.bigTitle, { textAlign: 'center', fontSize: 30, marginTop: 12 }]}>
              You are{'\n'}Protected!
            </Text>
            <Text style={[S.subtitle, { textAlign: 'center' }]}>
              SHIELD is ready. It watches over you automatically.
            </Text>
            <View style={S.tipsBox}>
              <Text style={S.tipsTitle}>HOW TO USE SHIELD</Text>
              <Text style={S.tip}>🆘  Tap SOS → confirmation dialog</Text>
              <Text style={S.tip}>⚡  Hold SOS 2 sec → instant alert</Text>
              <Text style={S.tip}>🎤  Say your phrase → auto SOS alert</Text>
              <Text style={S.tip}>📞  Fake Call button → escape danger</Text>
              <Text style={S.tip}>📍  Live GPS sent to all contacts</Text>
              <Text style={S.tip}>🚔  Police 112 always alerted</Text>
            </View>
            <TouchableOpacity
              style={[S.btn, { width: '100%', marginTop: 24 }]}
              onPress={finish}>
              <Text style={S.btnText}>Start SHIELD →</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* ── Phone Book Picker Modal (outside ScrollView) */}
      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={S.overlay}>
          <View style={S.pickerCard}>
            <View style={S.pickerHeader}>
              <Text style={S.modalTitle}>📒 Pick from Contacts</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={S.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={S.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts..."
              placeholderTextColor={Colors.textSecondary}
              autoFocus
            />
            <FlatList
              data={filteredContacts}
              keyExtractor={c => c.id}
              style={{ maxHeight: 400 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={S.pickerItem}
                  onPress={() => applyContact(item)}>
                  <View style={S.avatar}>
                    <Text style={S.avatarTxt}>
                      {(item.fullName ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.pickerName}>{item.fullName ?? '—'}</Text>
                    <Text style={S.pickerPhone} numberOfLines={1}>
                      {item.phones.map(p => p.number).join(', ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={S.emptyPicker}>
                  {allContacts.length === 0 ? 'Loading contacts...' : 'No contacts found'}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  content:      { padding: 24, paddingBottom: 60 },

  // Welcome
  logoWrap:     { alignItems: 'center', marginTop: 32, marginBottom: 20 },
  shieldIcon:   { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.shieldPurple, justifyContent: 'center', alignItems: 'center', marginBottom: 12, elevation: 8 },
  shieldIconText:{ fontSize: 44 },
  bigTitle:     { fontSize: 38, fontWeight: 'bold', color: Colors.shieldPurple, letterSpacing: 6 },
  tagline:      { fontSize: 14, color: Colors.textSecondary, letterSpacing: 2, marginTop: 4 },
  featureBox:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 12 },
  featureRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  featureIcon:  { fontSize: 16, width: 26 },
  featureItem:  { fontSize: 14, color: Colors.textPrimary, lineHeight: 20, flex: 1 },
  permNote:     { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 16 },

  // Steps
  stepBadge:    { fontSize: 12, fontWeight: 'bold', color: Colors.shieldPurple, backgroundColor: Colors.shieldPurpleLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 10, marginTop: 4 },
  title:        { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
  subtitle:     { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 20 },
  label:        { fontSize: 12, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  input:        { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.textPrimary, marginBottom: 10 },
  btn:          { backgroundColor: Colors.shieldPurple, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  btnText:      { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
  back:         { color: Colors.shieldPurple, fontSize: 14, marginBottom: 12, marginTop: 8 },

  // Police box
  policeBox:    { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#1565C0' },
  policeText:   { fontSize: 14, color: '#1565C0', fontWeight: 'bold' },

  // Contact slots with + picker
  slotBox:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  slotHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pickBtn:      { backgroundColor: Colors.safeGreen, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  pickBtnTxt:   { color: Colors.white, fontWeight: 'bold', fontSize: 13 },

  // Voice
  voiceBox:     { backgroundColor: Colors.amberLight, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.amber },
  voiceBoxTitle:{ fontSize: 13, fontWeight: 'bold', color: Colors.amber, marginBottom: 8 },
  voiceBoxText: { fontSize: 13, color: '#5D4037', marginBottom: 4, lineHeight: 20 },

  // Done
  doneIcon:     { fontSize: 64, marginTop: 20 },
  tipsBox:      { backgroundColor: Colors.shieldPurpleLight, borderRadius: 12, padding: 16, width: '100%', marginTop: 16 },
  tipsTitle:    { fontSize: 11, fontWeight: 'bold', color: Colors.shieldPurple, letterSpacing: 1.5, marginBottom: 10 },
  tip:          { fontSize: 14, color: Colors.shieldPurpleDark, marginBottom: 8, lineHeight: 22 },

  // Phone picker modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard:   { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '85%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  pickerClose:  { fontSize: 20, color: Colors.textSecondary, paddingHorizontal: 4 },
  searchInput:  { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 8 },
  pickerItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
  avatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.shieldPurple, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:    { color: Colors.white, fontWeight: 'bold', fontSize: 16 },
  pickerName:   { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  pickerPhone:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyPicker:  { textAlign: 'center', color: Colors.textSecondary, padding: 24, fontSize: 14 },
});