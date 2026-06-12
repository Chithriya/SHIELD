// src/screens/EmergencyContactsScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, TextInput, Modal, ActivityIndicator, Platform,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ContactVerificationService, VerificationStatus } from '../services/ContactVerificationService';

const MAX_CONTACTS = 5;

const VERIFY_COLORS = {
  [VerificationStatus.VERIFIED]:   { bg: '#1B5E20', text: '#A5D6A7', icon: 'shield-checkmark' },
  [VerificationStatus.TEST_SENT]:  { bg: '#0D47A1', text: '#90CAF9', icon: 'paper-plane' },
  [VerificationStatus.FAILED]:     { bg: '#B71C1C', text: '#EF9A9A', icon: 'alert-circle' },
  [VerificationStatus.UNVERIFIED]: { bg: '#333',     text: '#9E9E9E', icon: 'help-circle-outline' },
};

export default function EmergencyContactsScreen() {
  const [contacts, setContacts] = useState([]);
  const [verificationMap, setVerificationMap] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [sendingTestId, setSendingTestId] = useState(null);

  useEffect(() => {
    _load();
  }, []);

  const _load = useCallback(async () => {
    const raw = await AsyncStorage.getItem('emergency_contacts');
    const list = raw ? JSON.parse(raw) : [];
    setContacts(list);
    const vm = await ContactVerificationService.getAllStatuses();
    setVerificationMap(vm);
  }, []);

  const _save = async (list) => {
    await AsyncStorage.setItem('emergency_contacts', JSON.stringify(list));
    setContacts(list);
  };

  // ─── Import from device contacts ─────────────────────────────────────────
  const importFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Cannot access device contacts.');
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
    });
    if (!data.length) return;

    // Show picker-style alert (simplified; replace with a proper modal if needed)
    const options = data.slice(0, 20).map(c => ({
      text: c.name || 'Unknown',
      onPress: () => {
        const phone = c.phoneNumbers?.[0]?.number?.replace(/\s/g, '') || '';
        const email = c.emails?.[0]?.email || '';
        setForm({ name: c.name || '', phone, email });
        setModalVisible(true);
      },
    }));
    Alert.alert('Select Contact', 'Choose from your contacts', [
      ...options.slice(0, 6),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Add contact ─────────────────────────────────────────────────────────
  const addContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      Alert.alert('Required', 'Name and phone number are required.');
      return;
    }
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert('Limit Reached', `Maximum ${MAX_CONTACTS} emergency contacts allowed.`);
      return;
    }
    setSaving(true);

    const newContact = {
      id: `contact_${Date.now()}`,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      addedAt: Date.now(),
    };

    const updated = [...contacts, newContact];
    await _save(updated);

    // Send verification / test message
    const sent = await ContactVerificationService.sendVerificationMessage(newContact);
    const vm = await ContactVerificationService.getAllStatuses();
    setVerificationMap(vm);

    setSaving(false);
    setModalVisible(false);
    setForm({ name: '', phone: '', email: '' });

    Alert.alert(
      sent ? 'Contact Added ✓' : 'Contact Added',
      sent
        ? `${newContact.name} has been notified that they're your emergency contact.`
        : `${newContact.name} added, but the test message could not be sent. You can retry anytime.`
    );
  };

  // ─── Send test message manually ──────────────────────────────────────────
  const resendTest = async (contact) => {
    setSendingTestId(contact.id);
    const sent = await ContactVerificationService.sendVerificationMessage(contact);
    const vm = await ContactVerificationService.getAllStatuses();
    setVerificationMap(vm);
    setSendingTestId(null);
    Alert.alert(
      sent ? 'Test Sent ✓' : 'Failed',
      sent
        ? 'Test message sent to ' + contact.name
        : 'Could not send test message. Check if SMS is available.'
    );
  };

  // ─── Mark as verified manually ───────────────────────────────────────────
  const markVerified = async (contact) => {
    await ContactVerificationService.markVerified(contact.id);
    const vm = await ContactVerificationService.getAllStatuses();
    setVerificationMap(vm);
  };

  // ─── Delete ──────────────────────────────────────────────────────────────
  const deleteContact = (contact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const updated = contacts.filter(c => c.id !== contact.id);
            await _save(updated);
            await ContactVerificationService.removeContact(contact.id);
            const vm = await ContactVerificationService.getAllStatuses();
            setVerificationMap(vm);
          },
        },
      ]
    );
  };

  // ─── Render item ─────────────────────────────────────────────────────────
  const renderContact = ({ item }) => {
    const vs = verificationMap[item.id] ?? { status: VerificationStatus.UNVERIFIED };
    const style = VERIFY_COLORS[vs.status] ?? VERIFY_COLORS[VerificationStatus.UNVERIFIED];

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.contactName}>{item.name}</Text>
            <Text style={styles.contactPhone}>{item.phone}</Text>
            {item.email ? <Text style={styles.contactEmail}>{item.email}</Text> : null}
            <View style={[styles.verifyBadge, { backgroundColor: style.bg }]}>
              <Ionicons name={style.icon} size={11} color={style.text} />
              <Text style={[styles.verifyText, { color: style.text }]}>
                {vs.status === VerificationStatus.VERIFIED
                  ? 'Verified'
                  : vs.status === VerificationStatus.TEST_SENT
                  ? 'Test Sent'
                  : vs.status === VerificationStatus.FAILED
                  ? 'Test Failed'
                  : 'Unverified'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          {sendingTestId === item.id ? (
            <ActivityIndicator size="small" color="#E53935" />
          ) : (
            <>
              <TouchableOpacity onPress={() => resendTest(item)} style={styles.actionBtn}>
                <Ionicons name="paper-plane-outline" size={18} color="#90CAF9" />
              </TouchableOpacity>
              {vs.status !== VerificationStatus.VERIFIED && (
                <TouchableOpacity onPress={() => markVerified(item)} style={styles.actionBtn}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#A5D6A7" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => deleteContact(item)} style={styles.actionBtn}>
                <Ionicons name="trash-outline" size={18} color="#EF9A9A" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Emergency Contacts</Text>
        <Text style={styles.subtitle}>{contacts.length}/{MAX_CONTACTS} contacts</Text>
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Verification Status Legend</Text>
        <View style={styles.legendRow}>
          {Object.entries(VERIFY_COLORS).map(([status, s]) => (
            <View key={status} style={[styles.legendItem, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={10} color={s.text} />
              <Text style={[styles.legendText, { color: s.text }]}>
                {status === VerificationStatus.VERIFIED ? 'Verified'
                  : status === VerificationStatus.TEST_SENT ? 'Test Sent'
                  : status === VerificationStatus.FAILED ? 'Failed'
                  : 'Unverified'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        renderItem={renderContact}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={60} color="#333" />
            <Text style={styles.emptyText}>No emergency contacts yet</Text>
            <Text style={styles.emptySubText}>Add contacts who will be alerted during SOS</Text>
          </View>
        }
      />

      {contacts.length < MAX_CONTACTS && (
        <View style={styles.addRow}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Manually</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#1A237E' }]} onPress={importFromContacts}>
            <Ionicons name="people" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Import Contact</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Contact Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name *"
              placeholderTextColor="#555"
              value={form.name}
              onChangeText={t => setForm(f => ({ ...f, name: t }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number *"
              placeholderTextColor="#555"
              value={form.phone}
              onChangeText={t => setForm(f => ({ ...f, phone: t }))}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor="#555"
              value={form.email}
              onChangeText={t => setForm(f => ({ ...f, email: t }))}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.modalNote}>
              ✉️ A test notification will be sent to this contact when you add them.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => { setModalVisible(false); setForm({ name: '', phone: '', email: '' }); }}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addContact} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Add Contact</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 13 },

  legend: { paddingHorizontal: 20, marginBottom: 8 },
  legendTitle: { color: '#666', fontSize: 11, marginBottom: 6 },
  legendRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  legendText: { fontSize: 10 },

  list: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  card: {
    backgroundColor: '#161616', borderRadius: 14, padding: 14,
    marginBottom: 10, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  cardLeft: { flexDirection: 'row', gap: 12, flex: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  cardInfo: { flex: 1 },
  contactName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  contactPhone: { color: '#aaa', fontSize: 13, marginTop: 2 },
  contactEmail: { color: '#888', fontSize: 12, marginTop: 1 },
  verifyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, marginTop: 6,
  },
  verifyText: { fontSize: 10, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: '#555', fontSize: 16, fontWeight: '600', marginTop: 16 },
  emptySubText: { color: '#444', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },

  addRow: {
    position: 'absolute', bottom: 30, left: 16, right: 16,
    flexDirection: 'row', gap: 10,
  },
  addBtn: {
    flex: 1, flexDirection: 'row', gap: 8,
    backgroundColor: '#E53935', padding: 14, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 20 },
  input: {
    backgroundColor: '#252525', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15, marginBottom: 12,
  },
  modalNote: { color: '#666', fontSize: 12, marginBottom: 20, lineHeight: 18 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelModalBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#333', alignItems: 'center',
  },
  cancelModalText: { color: '#888', fontWeight: '600' },
  saveBtn: {
    flex: 1, backgroundColor: '#E53935', padding: 14,
    borderRadius: 10, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
