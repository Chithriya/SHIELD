// src/screens/SOSScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Alert, Platform, Vibration,
} from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { EmergencyMessagingService, DeliveryStatus } from '../services/EmergencyMessagingService';
import { BackgroundSOSService } from '../services/BackgroundSOSService';
import { OfflineQueueService } from '../services/OfflineQueueService';

const COUNTDOWN_SECONDS = 5;

export default function SOSScreen({ navigation }) {
  const [phase, setPhase] = useState('idle'); // idle | countdown | active | cancelled
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [contacts, setContacts] = useState([]);
  const [deliveryStatus, setDeliveryStatus] = useState({});
  const [location, setLocation] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [alertId, setAlertId] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef(null);
  const pollingRef = useRef(null);

  // ─── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    _loadContacts();
    _fetchLocation();
    _checkBattery();
    _watchNetwork();
    BackgroundSOSService.initialize();
    return () => {
      clearInterval(countdownRef.current);
      clearInterval(pollingRef.current);
    };
  }, []);

  const _loadContacts = async () => {
    const raw = await AsyncStorage.getItem('emergency_contacts');
    if (raw) setContacts(JSON.parse(raw));
  };

  const _fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc.coords);
      await AsyncStorage.setItem('last_known_location', JSON.stringify(loc.coords));
    } catch (_) {}
  };

  const _checkBattery = async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(Math.round(level * 100));
    } catch (_) {}
  };

  const _watchNetwork = () => {
    NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });
    OfflineQueueService.getQueueSize().then(setQueuedCount);
  };

  // ─── Pulse animation for active SOS ─────────────────────────────────────
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // ─── SOS Trigger Flow ────────────────────────────────────────────────────
  const handleSOSPress = () => {
    if (contacts.length === 0) {
      Alert.alert(
        'No Emergency Contacts',
        'Please add at least one emergency contact before sending SOS.',
        [{ text: 'Add Now', onPress: () => navigation.navigate('EmergencyContacts') }]
      );
      return;
    }
    setPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    Vibration.vibrate([0, 300, 100, 300]);
    startPulse();
    _startCountdown();
  };

  const _startCountdown = () => {
    let remaining = COUNTDOWN_SECONDS;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        _fireSOS();
      }
    }, 1000);
  };

  const cancelSOS = () => {
    clearInterval(countdownRef.current);
    stopPulse();
    setPhase('idle');
    setCountdown(COUNTDOWN_SECONDS);
    Vibration.cancel();
  };

  const _fireSOS = async () => {
    setPhase('active');
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    await BackgroundSOSService.triggerSOS();

    // Optimistically show pending status for all contacts
    const pending = {};
    contacts.forEach(c => {
      pending[c.id] = {
        name: c.name,
        sms: DeliveryStatus.PENDING,
        whatsapp: DeliveryStatus.PENDING,
        email: c.email ? DeliveryStatus.PENDING : 'n/a',
      };
    });
    setDeliveryStatus(pending);

    const { alertId: id, statusMap } = await EmergencyMessagingService.sendSOSAlert(
      contacts,
      location,
      { battery: batteryLevel }
    );
    setAlertId(id);
    setDeliveryStatus(statusMap);

    // Poll for status updates (retry outcomes)
    pollingRef.current = setInterval(async () => {
      const updated = await EmergencyMessagingService.getAlertStatus(id);
      if (updated) setDeliveryStatus({ ...updated });
    }, 4000);
  };

  const deactivateSOS = async () => {
    clearInterval(pollingRef.current);
    stopPulse();
    await BackgroundSOSService.cancelSOS();
    Vibration.cancel();
    setPhase('idle');
    setDeliveryStatus({});
    setAlertId(null);
  };

  // ─── Render Helpers ──────────────────────────────────────────────────────
  const _statusIcon = (status) => {
    switch (status) {
      case DeliveryStatus.SENT:      return { icon: 'checkmark-circle', color: '#4CAF50' };
      case DeliveryStatus.DELIVERED: return { icon: 'checkmark-done-circle', color: '#2196F3' };
      case DeliveryStatus.FAILED:    return { icon: 'close-circle', color: '#F44336' };
      case DeliveryStatus.PENDING:   return { icon: 'time', color: '#FF9800' };
      default:                       return { icon: 'remove-circle-outline', color: '#9E9E9E' };
    }
  };

  const _statusLabel = (status) => {
    if (status === 'n/a') return 'N/A';
    return status?.charAt(0).toUpperCase() + status?.slice(1) || '—';
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header status bar */}
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: isOnline ? '#4CAF50' : '#FF9800' }]}>
          <Ionicons name={isOnline ? 'wifi' : 'cloud-offline'} size={12} color="#fff" />
          <Text style={styles.badgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        {!isOnline && queuedCount > 0 && (
          <Text style={styles.queueNote}>{queuedCount} alert(s) queued for retry</Text>
        )}
        {batteryLevel !== null && (
          <View style={styles.badge}>
            <Ionicons name="battery-half" size={12} color="#fff" />
            <Text style={styles.badgeText}>{batteryLevel}%</Text>
          </View>
        )}
      </View>

      {/* Main SOS Button */}
      <View style={styles.center}>
        {phase === 'idle' && (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity style={styles.sosButton} onPress={handleSOSPress} activeOpacity={0.85}>
              <Text style={styles.sosLabel}>SOS</Text>
              <Text style={styles.sosSubLabel}>Press to Alert</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {phase === 'countdown' && (
          <View style={styles.countdownContainer}>
            <Animated.View style={[styles.sosButtonActive, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.sosSubLabel}>Sending SOS…</Text>
            </Animated.View>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelSOS}>
              <Ionicons name="close-circle" size={22} color="#fff" />
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'active' && (
          <View style={styles.activeContainer}>
            <Animated.View style={[styles.sosButtonActive, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="radio" size={36} color="#fff" />
              <Text style={styles.activeLabel}>SOS ACTIVE</Text>
            </Animated.View>
            <TouchableOpacity style={styles.deactivateBtn} onPress={deactivateSOS}>
              <Text style={styles.deactivateText}>DEACTIVATE SOS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Location row */}
      <View style={styles.locRow}>
        <Ionicons
          name={location ? 'location' : 'location-outline'}
          size={16}
          color={location ? '#4CAF50' : '#9E9E9E'}
        />
        <Text style={[styles.locText, { color: location ? '#4CAF50' : '#9E9E9E' }]}>
          {location
            ? `Location ready (±${Math.round(location.accuracy ?? 0)}m)`
            : 'Acquiring GPS…'}
        </Text>
      </View>

      {/* Delivery Status Panel */}
      {phase === 'active' && Object.keys(deliveryStatus).length > 0 && (
        <ScrollView style={styles.statusPanel} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.statusTitle}>Alert Delivery Status</Text>
          {Object.entries(deliveryStatus).map(([id, info]) => {
            const smsIco = _statusIcon(info.sms);
            const waIco = _statusIcon(info.whatsapp);
            const emailIco = info.email !== 'n/a' ? _statusIcon(info.email) : null;
            return (
              <View key={id} style={styles.contactCard}>
                <Text style={styles.contactName}>{info.name}</Text>
                <View style={styles.channelRow}>
                  <View style={styles.channelItem}>
                    <Ionicons name={smsIco.icon} size={18} color={smsIco.color} />
                    <Text style={[styles.channelLabel, { color: smsIco.color }]}>
                      SMS {_statusLabel(info.sms)}
                    </Text>
                  </View>
                  <View style={styles.channelItem}>
                    <Ionicons name={waIco.icon} size={18} color={waIco.color} />
                    <Text style={[styles.channelLabel, { color: waIco.color }]}>
                      WhatsApp {_statusLabel(info.whatsapp)}
                    </Text>
                  </View>
                  {emailIco && (
                    <View style={styles.channelItem}>
                      <Ionicons name={emailIco.icon} size={18} color={emailIco.color} />
                      <Text style={[styles.channelLabel, { color: emailIco.color }]}>
                        Email {_statusLabel(info.email)}
                      </Text>
                    </View>
                  )}
                </View>
                {info.retries > 0 && (
                  <Text style={styles.retryNote}>↻ Retried {info.retries}× automatically</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* No contacts warning */}
      {contacts.length === 0 && (
        <TouchableOpacity
          style={styles.noContactBanner}
          onPress={() => navigation.navigate('EmergencyContacts')}
        >
          <Ionicons name="warning" size={18} color="#F44336" />
          <Text style={styles.noContactText}>No emergency contacts added. Tap to add.</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1E1E1E', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontSize: 11 },
  queueNote: { color: '#FF9800', fontSize: 11, flex: 1 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sosButton: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#E53935',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 24, elevation: 12,
  },
  sosButtonActive: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#B71C1C',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 30, elevation: 16,
  },
  sosLabel: { color: '#fff', fontSize: 44, fontWeight: '900' },
  sosSubLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  activeLabel: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 },

  countdownContainer: { alignItems: 'center', gap: 20 },
  countdownNumber: { color: '#fff', fontSize: 64, fontWeight: '900' },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#333', paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 30,
  },
  cancelText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  activeContainer: { alignItems: 'center', gap: 24 },
  deactivateBtn: {
    backgroundColor: '#212121', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 30, borderWidth: 1, borderColor: '#E53935',
  },
  deactivateText: { color: '#E53935', fontWeight: '700', fontSize: 15 },

  locRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  locText: { fontSize: 12 },

  statusPanel: {
    maxHeight: 280, backgroundColor: '#111',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16,
  },
  statusTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 12 },
  contactCard: {
    backgroundColor: '#1A1A1A', borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  contactName: { color: '#fff', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  channelItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  channelLabel: { fontSize: 12, fontWeight: '500' },
  retryNote: { color: '#FF9800', fontSize: 11, marginTop: 6 },

  noContactBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A0000', padding: 14, margin: 16,
    borderRadius: 10, borderWidth: 1, borderColor: '#E53935',
  },
  noContactText: { color: '#F44336', fontSize: 13, flex: 1 },
});
