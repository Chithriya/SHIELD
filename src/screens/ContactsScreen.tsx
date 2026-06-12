// src/screens/ContactsScreen.tsx
// FIXED: Contacts loading — safer import pattern, pageSize, robust error handling

import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, FlatList,
  StyleSheet, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
// ── FIXED: use namespace import — avoids named-export issues in expo-contacts 56.x ──
import * as ExpoContacts from 'expo-contacts';
import { Colors } from '../constants/colors';
import { storage } from '../services/StorageService';
import { EmergencyContact } from '../constants/types';

// ── Local shape for the picker list ──────────────────────────────────────────
interface PickerContact {
  id: string;
  fullName: string | null;
  phones: { id: string; label?: string; number?: string }[];
}

export default function ContactsScreen() {
  const [contacts,    setContacts]    = useState<EmergencyContact[]>([]);

  // ── Add modal ─────────────────────────────────────────────────────────────
  const [addModal,    setAddModal]    = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newPhone,    setNewPhone]    = useState('');
  const [newRel,      setNewRel]      = useState('');

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editModal,   setEditModal]   = useState(false);
  const [editTarget,  setEditTarget]  = useState<EmergencyContact | null>(null);
  const [editName,    setEditName]    = useState('');
  const [editPhone,   setEditPhone]   = useState('');
  const [editRel,     setEditRel]     = useState('');

  // ── Phone book picker ─────────────────────────────────────────────────────
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [pickerTarget,  setPickerTarget]  = useState<'add' | 'edit'>('add');
  const [allContacts,   setAllContacts]   = useState<PickerContact[]>([]);
  const [pickerSearch,  setPickerSearch]  = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));
  const load = async () => setContacts(await storage.getContacts());

  // ── Open phone book picker ────────────────────────────────────────────────
  const openPicker = async (target: 'add' | 'edit') => {
    setPickerTarget(target);
    setPickerOpen(true);
    setPickerLoading(true);
    setAllContacts([]);
    setPickerSearch('');

    try {
      // Step 1: request permission
      const { status } = await ExpoContacts.requestPermissionsAsync();

      if (status !== 'granted') {
        setPickerOpen(false);
        Alert.alert(
          'Permission Required',
          'Please allow contact access in device Settings → SHIELD → Contacts.',
        );
        return;
      }

      // Step 2: fetch contacts — FIXED: use pageSize to avoid memory crash,
      // and wrap fields access defensively
      const result = await ExpoContacts.getContactsAsync({
        fields: [
          ExpoContacts.Fields.Name,
          ExpoContacts.Fields.PhoneNumbers,
        ],
        pageSize: 300,  // FIXED: prevents OOM on huge address books
        pageOffset: 0,
      });

      const rawData = result?.data ?? [];

      // Step 3: filter and normalise — FIXED: safe access on every field
      const withPhone: PickerContact[] = rawData
        .filter(c => {
          const name   = c.name ?? '';
          const phones = c.phoneNumbers ?? [];
          return name.length > 0 && phones.length > 0;
        })
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map(c => ({
          id:       c.id ?? String(Math.random()),
          fullName: c.name ?? null,
          phones:   (c.phoneNumbers ?? []).map(p => ({
            id:     p.id ?? String(Math.random()),
            label:  p.label,
            number: p.number,
          })),
        }));

      setAllContacts(withPhone);

      if (withPhone.length === 0) {
        // Contacts exist but none have phone numbers stored
        Alert.alert(
          'No Phone Contacts Found',
          'No contacts with phone numbers were found. You can add contacts manually.',
          [{ text: 'OK', onPress: () => setPickerOpen(false) }],
        );
      }
    } catch (err: any) {
      // FIXED: log the real error and close picker gracefully
      console.warn('[SHIELD] openPicker error:', err?.message ?? err);
      setPickerOpen(false);
      Alert.alert(
        'Could Not Load Contacts',
        'Please enter contact details manually.\n\nIf this keeps happening, check that SHIELD has contact permission in your device settings.',
      );
    } finally {
      setPickerLoading(false);
    }
  };

  // ── Select contact from picker ────────────────────────────────────────────
  const selectContact = (contact: PickerContact) => {
    const phones = contact.phones ?? [];
    if (phones.length === 0) return;

    const apply = (num: string) => {
      if (pickerTarget === 'add') {
        setNewName(contact.fullName ?? '');
        setNewPhone(num);
      } else {
        setEditName(contact.fullName ?? '');
        setEditPhone(num);
      }
      setPickerOpen(false);
    };

    if (phones.length === 1) {
      apply(phones[0].number ?? '');
    } else {
      setPickerOpen(false);
      setTimeout(() => {
        Alert.alert(
          `Choose number for ${contact.fullName}`,
          '',
          phones
            .map(p => ({
              text:    `${p.label ? p.label + ': ' : ''}${p.number}`,
              onPress: () => apply(p.number ?? ''),
            }))
            .concat([{ text: 'Cancel', style: 'cancel' } as any]),
        );
      }, 400);
    }
  };

  const filteredContacts = allContacts.filter(c =>
    (c.fullName ?? '').toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  // ── Add contact ───────────────────────────────────────────────────────────
  const addContact = async () => {
    if (!newName.trim() || !newPhone.trim())
      return Alert.alert('Required', 'Enter name and phone number.');
    if (contacts.filter(c => c.id !== 'police_112').length >= 5)
      return Alert.alert('Limit', 'Maximum 5 personal contacts allowed.');

    const c: EmergencyContact = {
      id:        Date.now().toString(),
      name:      newName.trim(),
      phone:     newPhone.trim(),
      relation:  newRel.trim() || 'Contact',
      isPrimary: contacts.filter(x => x.id !== 'police_112').length === 0,
    };
    await storage.saveContacts([...contacts.filter(x => x.id !== 'police_112'), c]);
    await load();
    setAddModal(false);
    setNewName(''); setNewPhone(''); setNewRel('');
  };

  // ── Remove contact ────────────────────────────────────────────────────────
  const removeContact = (id: string) => {
    if (id === 'police_112') {
      Alert.alert('Cannot Remove', 'Police 112 is a default emergency contact.');
      return;
    }
    const c = contacts.find(x => x.id === id);
    Alert.alert('Remove Contact', `Remove ${c?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          let updated = contacts.filter(x => x.id !== id && x.id !== 'police_112');
          if (updated.length && !updated.some(x => x.isPrimary)) updated[0].isPrimary = true;
          await storage.saveContacts(updated);
          await load();
        },
      },
    ]);
  };

  // ── Set primary ───────────────────────────────────────────────────────────
  const setPrimary = async (id: string) => {
    if (id === 'police_112') return;
    const updated = contacts
      .filter(x => x.id !== 'police_112')
      .map(c => ({ ...c, isPrimary: c.id === id }));
    await storage.saveContacts(updated);
    await load();
  };

  // ── Open edit ─────────────────────────────────────────────────────────────
  const openEdit = (item: EmergencyContact) => {
    setEditTarget(item);
    setEditName(item.name);
    setEditPhone(item.phone);
    setEditRel(item.relation);
    setEditModal(true);
  };

  // ── Save edit ─────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editName.trim() || !editPhone.trim())
      return Alert.alert('Required', 'Enter name and phone number.');
    const updated = contacts
      .filter(x => x.id !== 'police_112')
      .map(c =>
        c.id === editTarget.id
          ? { ...c, name: editName.trim(), phone: editPhone.trim(), relation: editRel.trim() || 'Contact' }
          : c,
      );
    await storage.saveContacts(updated);
    await load();
    setEditModal(false);
    setEditTarget(null);
  };

  // ── Contact card ──────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: EmergencyContact }) => {
    const isPolice = item.id === 'police_112';
    return (
      <View style={[S.card, isPolice && S.policeCard]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={S.cName}>{isPolice ? '🚔 ' : ''}{item.name}</Text>
            {item.isPrimary && !isPolice && (
              <View style={S.badge}><Text style={S.badgeTxt}>Primary</Text></View>
            )}
            {isPolice && (
              <View style={S.policeBadge}><Text style={S.policeBadgeTxt}>Default</Text></View>
            )}
          </View>
          <Text style={S.cPhone}>{item.phone}</Text>
          <Text style={S.cRel}>{item.relation}</Text>
        </View>
        <View style={{ gap: 4, alignItems: 'flex-end' }}>
          {!isPolice && (
            <TouchableOpacity onPress={() => setPrimary(item.id)}>
              <Text style={S.action}>Set Primary</Text>
            </TouchableOpacity>
          )}
          {!isPolice && (
            <TouchableOpacity onPress={() => openEdit(item)}>
              <Text style={[S.action, { color: Colors.blue }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => removeContact(item.id)}>
            <Text style={[S.action, { color: isPolice ? '#9E9E9E' : Colors.sosRed }]}>
              {isPolice ? 'Protected' : 'Remove'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={S.container}>
      <FlatList
        data={contacts}
        keyExtractor={i => i.id}
        contentContainerStyle={S.list}
        ListHeaderComponent={
          <View style={S.infoBox}>
            <Text style={S.infoText}>
              All contacts receive automatic SMS when SOS is triggered.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={S.empty}>No contacts yet. Tap the button below to add one.</Text>
        }
        ListFooterComponent={
          <TouchableOpacity style={S.addBtn} onPress={() => setAddModal(true)}>
            <Text style={S.addBtnTxt}>+ Add Emergency Contact</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
      />

      {/* ══ ADD CONTACT MODAL ═══════════════════════════════════════════════ */}
      <Modal visible={addModal} animationType="slide" transparent>
        <View style={S.overlay}>
          <View style={S.sheet}>
            <Text style={S.sheetTitle}>Add Emergency Contact</Text>
            <TouchableOpacity
              style={S.phoneBookBtn}
              onPress={() => openPicker('add')}>
              <Text style={S.phoneBookBtnTxt}>📒  Pick from Phone Contacts</Text>
            </TouchableOpacity>
            <Text style={S.orDivider}>— or enter manually —</Text>
            <TextInput style={S.input} value={newName} onChangeText={setNewName}
              placeholder="Full name" placeholderTextColor={Colors.textSecondary} />
            <TextInput style={S.input} value={newPhone} onChangeText={setNewPhone}
              placeholder="Phone number" keyboardType="phone-pad"
              placeholderTextColor={Colors.textSecondary} />
            <TextInput style={S.input} value={newRel} onChangeText={setNewRel}
              placeholder="Relation (e.g. Mother, Friend)"
              placeholderTextColor={Colors.textSecondary} />
            <View style={S.btnRow}>
              <TouchableOpacity style={S.cancelBtn}
                onPress={() => { setAddModal(false); setNewName(''); setNewPhone(''); setNewRel(''); }}>
                <Text style={S.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.saveBtn} onPress={addContact}>
                <Text style={S.saveTxt}>Add Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ EDIT CONTACT MODAL ══════════════════════════════════════════════ */}
      <Modal visible={editModal} animationType="slide" transparent>
        <View style={S.overlay}>
          <View style={S.sheet}>
            <Text style={S.sheetTitle}>Edit Contact</Text>
            <TouchableOpacity
              style={S.phoneBookBtn}
              onPress={() => openPicker('edit')}>
              <Text style={S.phoneBookBtnTxt}>📒  Pick from Phone Contacts</Text>
            </TouchableOpacity>
            <Text style={S.orDivider}>— or edit manually —</Text>
            <TextInput style={S.input} value={editName} onChangeText={setEditName}
              placeholder="Full name" placeholderTextColor={Colors.textSecondary} />
            <TextInput style={S.input} value={editPhone} onChangeText={setEditPhone}
              placeholder="Phone number" keyboardType="phone-pad"
              placeholderTextColor={Colors.textSecondary} />
            <TextInput style={S.input} value={editRel} onChangeText={setEditRel}
              placeholder="Relation (e.g. Mother, Friend)"
              placeholderTextColor={Colors.textSecondary} />
            <View style={S.btnRow}>
              <TouchableOpacity style={S.cancelBtn}
                onPress={() => { setEditModal(false); setEditTarget(null); }}>
                <Text style={S.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.saveBtn} onPress={saveEdit}>
                <Text style={S.saveTxt}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ PHONE BOOK PICKER MODAL ════════════════════════════════════════ */}
      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={S.overlay}>
          <View style={S.pickerCard}>
            <View style={S.pickerHeader}>
              <Text style={S.sheetTitle}>📒 Pick from Contacts</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={S.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {pickerLoading ? (
              <View style={S.pickerLoadingBox}>
                <Text style={S.pickerLoadingTxt}>Loading contacts…</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={S.searchInput}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  placeholder="Search contacts..."
                  placeholderTextColor={Colors.textSecondary}
                  autoFocus
                />
                <FlatList
                  data={filteredContacts}
                  keyExtractor={c => c.id}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={S.pickerItem} onPress={() => selectContact(item)}>
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
                      {allContacts.length === 0 ? 'No contacts found on this device' : 'No results'}
                    </Text>
                  }
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.background },
  list:            { padding: 16, paddingBottom: 20 },
  infoBox:         { backgroundColor: Colors.blueLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.blue },
  infoText:        { fontSize: 13, color: Colors.blue, lineHeight: 18 },
  card:            { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 1 },
  policeCard:      { borderColor: '#1565C0', backgroundColor: '#F8F9FF' },
  cName:           { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  cPhone:          { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  cRel:            { fontSize: 12, color: Colors.textSecondary },
  badge:           { backgroundColor: Colors.shieldPurpleLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:        { fontSize: 10, color: Colors.shieldPurple, fontWeight: '600' },
  policeBadge:     { backgroundColor: '#BBDEFB', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  policeBadgeTxt:  { fontSize: 10, color: '#1565C0', fontWeight: '600' },
  action:          { fontSize: 12, color: Colors.shieldPurple, fontWeight: '600', paddingVertical: 2 },
  empty:           { textAlign: 'center', color: Colors.textSecondary, marginTop: 40, lineHeight: 24 },
  addBtn:          { backgroundColor: Colors.shieldPurple, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 8, marginHorizontal: 4 },
  addBtnTxt:       { color: Colors.white, fontWeight: 'bold', fontSize: 15 },

  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  sheetTitle:      { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
  phoneBookBtn:    { backgroundColor: Colors.safeGreen, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  phoneBookBtnTxt: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  orDivider:       { textAlign: 'center', color: Colors.textSecondary, fontSize: 12, marginBottom: 10 },
  input:           { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.textPrimary, marginBottom: 10 },
  btnRow:          { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn:       { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingVertical: 13, alignItems: 'center' },
  cancelTxt:       { color: Colors.textSecondary, fontWeight: '600' },
  saveBtn:         { flex: 1, backgroundColor: Colors.shieldPurple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveTxt:         { color: Colors.white, fontWeight: '600' },

  pickerCard:         { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '88%' },
  pickerHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  closeBtn:           { fontSize: 20, color: Colors.textSecondary, paddingHorizontal: 4 },
  pickerLoadingBox:   { alignItems: 'center', paddingVertical: 40 },
  pickerLoadingTxt:   { color: Colors.textSecondary, fontSize: 14 },
  searchInput:        { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 8 },
  pickerItem:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
  avatar:             { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.shieldPurple, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:          { color: Colors.white, fontWeight: 'bold', fontSize: 17 },
  pickerName:         { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  pickerPhone:        { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyPicker:        { textAlign: 'center', color: Colors.textSecondary, padding: 24, fontSize: 14 },
});
