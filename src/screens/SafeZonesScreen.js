// src/screens/SafeZonesScreen.js
// Manage geofence safe zones: Home, College, Workplace, Other

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, Alert, TextInput, ScrollView,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { GeofencingService } from '../services/GeofencingService';

const ZONE_TYPES = [
  { type: 'Home', icon: '🏠', color: '#4CAF50' },
  { type: 'College', icon: '🎓', color: '#2196F3' },
  { type: 'Workplace', icon: '💼', color: '#FF9800' },
  { type: 'Other', icon: '📍', color: '#9C27B0' },
];

export default function SafeZonesScreen() {
  const [zones, setZones] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'Home', latitude: null, longitude: null, radius: 200 });
  const [currentLocation, setCurrentLocation] = useState(null);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    _load();
    _getLocation();
  }, []);

  const _load = async () => {
    const z = await GeofencingService.getZones();
    setZones(z);
  };

  const _getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCurrentLocation(loc.coords);
  };

  const openAddModal = () => {
    setForm({
      name: '', type: 'Home',
      latitude: currentLocation?.latitude ?? null,
      longitude: currentLocation?.longitude ?? null,
      radius: 200,
    });
    setModalVisible(true);
  };

  const useCurrentLocation = () => {
    if (!currentLocation) return;
    setForm(f => ({ ...f, latitude: currentLocation.latitude, longitude: currentLocation.longitude }));
    Alert.alert('Location Set', 'Current location used as zone centre.');
  };

  const saveZone = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Zone name is required.'); return; }
    if (!form.latitude || !form.longitude) { Alert.alert('Required', 'Please set a location for this zone.'); return; }
    setSaving(true);
    try {
      await GeofencingService.addZone({
        name: form.name.trim(), type: form.type,
        latitude: form.latitude, longitude: form.longitude,
        radius: Number(form.radius) || 200,
      });
      await _load();
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  const deleteZone = (zone) => {
    Alert.alert('Delete Zone', `Remove "${zone.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await GeofencingService.deleteZone(zone.id); await _load(); },
      },
    ]);
  };

  const renderZone = ({ item }) => {
    const typeInfo = ZONE_TYPES.find(t => t.type === item.type) || ZONE_TYPES[3];
    return (
      <View style={styles.card}>
        <View style={[styles.zoneIcon, { backgroundColor: `${typeInfo.color}22` }]}>
          <Text style={styles.zoneEmoji}>{typeInfo.icon}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.zoneName}>{item.name}</Text>
          <Text style={styles.zoneType}>{item.type} • {item.radius}m radius</Text>
          <Text style={styles.zoneCoords}>
            {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => deleteZone(item)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color="#EF9A9A" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Safe Zones</Text>
        <Text style={styles.subtitle}>
          Get notified when you enter or leave these areas
        </Text>
      </View>

      <FlatList
        data={zones}
        keyExtractor={item => item.id}
        renderItem={renderZone}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={styles.emptyText}>No safe zones added yet</Text>
            <Text style={styles.emptySubText}>Add Home, College, or Workplace to get notified about zone events</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Zone Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modal} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.modalTitle}>Add Safe Zone</Text>

            {/* Type selector */}
            <Text style={styles.fieldLabel}>Zone Type</Text>
            <View style={styles.typeRow}>
              {ZONE_TYPES.map(t => (
                <TouchableOpacity
                  key={t.type}
                  style={[styles.typeBtn, form.type === t.type && { borderColor: t.color, backgroundColor: `${t.color}22` }]}
                  onPress={() => setForm(f => ({ ...f, type: t.type, name: t.type !== 'Other' ? t.type : f.name }))}
                >
                  <Text style={styles.typeEmoji}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, form.type === t.type && { color: t.color }]}>{t.type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Zone Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. My Home, Avinashilingam College"
              placeholderTextColor="#555"
              value={form.name}
              onChangeText={t => setForm(f => ({ ...f, name: t }))}
            />

            {/* Location */}
            <Text style={styles.fieldLabel}>Zone Location</Text>
            <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation}>
              <Ionicons name="location" size={16} color="#E53935" />
              <Text style={styles.locBtnText}>Use My Current Location</Text>
            </TouchableOpacity>
            {form.latitude && (
              <Text style={styles.coordsText}>
                📍 {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </Text>
            )}

            {/* Radius */}
            <Text style={styles.fieldLabel}>Alert Radius (metres)</Text>
            <View style={styles.radiusRow}>
              {[100, 200, 300, 500].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.radiusBtn, form.radius === r && styles.radiusBtnActive]}
                  onPress={() => setForm(f => ({ ...f, radius: r }))}
                >
                  <Text style={[styles.radiusBtnText, form.radius === r && { color: '#E53935' }]}>{r}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveZone} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add Zone'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 13, marginTop: 4 },

  list: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  card: {
    backgroundColor: '#161616', borderRadius: 14, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  zoneIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  zoneEmoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  zoneName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  zoneType: { color: '#aaa', fontSize: 12, marginTop: 2 },
  zoneCoords: { color: '#555', fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 6 },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 60 },
  emptyText: { color: '#555', fontSize: 16, fontWeight: '600', marginTop: 16 },
  emptySubText: { color: '#444', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },

  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: '#E53935', shadowOpacity: 0.5, shadowRadius: 10,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 20 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },

  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#333', backgroundColor: '#111',
  },
  typeEmoji: { fontSize: 20 },
  typeLabel: { color: '#888', fontSize: 11, marginTop: 4 },

  input: {
    backgroundColor: '#252525', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15, marginBottom: 16,
  },
  locBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: '#1A0000', padding: 12, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#E53935',
  },
  locBtnText: { color: '#E53935', fontWeight: '600', fontSize: 14 },
  coordsText: { color: '#666', fontSize: 12, marginBottom: 16 },

  radiusRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  radiusBtn: {
    flex: 1, padding: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#333', alignItems: 'center',
  },
  radiusBtnActive: { borderColor: '#E53935', backgroundColor: '#1A0000' },
  radiusBtnText: { color: '#888', fontWeight: '600' },

  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelModalBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#333', alignItems: 'center',
  },
  cancelModalText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#E53935', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
