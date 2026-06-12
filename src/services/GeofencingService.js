// src/services/GeofencingService.js
// Creates and monitors safe zones (Home, College, Workplace)
// Notifies guardians when user enters or leaves a zone

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmergencyMessagingService } from './EmergencyMessagingService';

export const GEOFENCE_TASK = 'SHIELD_GEOFENCE_TASK';
const ZONES_KEY = 'safe_zones';
const ZONE_ICONS = { Home: '🏠', College: '🎓', Workplace: '💼', Other: '📍' };

// ─── Background geofence handler ─────────────────────────────────────────────
TaskManager.defineTask(GEOFENCE_TASK, async ({ data: { eventType, region }, error }) => {
  if (error) return;
  const zones = await GeofencingService.getZones();
  const zone = zones.find(z => z.id === region.identifier);
  if (!zone) return;

  const entered = eventType === Location.GeofencingEventType.Enter;
  const eventLabel = entered ? 'entered' : 'left';
  const icon = ZONE_ICONS[zone.type] || '📍';

  // Local notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} ${zone.name}`,
      body: `You have ${eventLabel} ${zone.name}`,
      data: { zoneId: zone.id, event: eventLabel },
    },
    trigger: null,
  });

  // Notify guardians (emergency contacts)
  const contactsRaw = await AsyncStorage.getItem('emergency_contacts');
  const contacts = contactsRaw ? JSON.parse(contactsRaw) : [];
  if (contacts.length > 0) {
    const loc = await AsyncStorage.getItem('last_known_location');
    const location = loc ? JSON.parse(loc) : null;
    await EmergencyMessagingService.sendSOSAlert(contacts, location, {
      customMessage: `🔔 SHIELD Update: Your person has ${eventLabel} ${zone.name} (${icon}) at ${new Date().toLocaleTimeString('en-IN')}. They are safe.`,
      isSafetyUpdate: true,
    });
  }

  // Log event
  await GeofencingService._logEvent({ zoneId: zone.id, zoneName: zone.name, event: eventLabel, at: Date.now() });
});

// ─── GeofencingService ────────────────────────────────────────────────────────
class _GeofencingService {
  async initialize() {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[Geofence] Background location permission denied');
      return false;
    }
    await this._restartMonitoring();
    return true;
  }

  // ─── Zone CRUD ────────────────────────────────────────────────────────────

  async addZone({ name, type = 'Other', latitude, longitude, radius = 200 }) {
    const zones = await this.getZones();
    if (zones.length >= 10) throw new Error('Maximum 10 safe zones allowed');
    const zone = { id: `zone_${Date.now()}`, name, type, latitude, longitude, radius, createdAt: Date.now() };
    zones.push(zone);
    await AsyncStorage.setItem(ZONES_KEY, JSON.stringify(zones));
    await this._restartMonitoring();
    return zone;
  }

  async updateZone(id, updates) {
    const zones = await this.getZones();
    const idx = zones.findIndex(z => z.id === id);
    if (idx === -1) throw new Error('Zone not found');
    zones[idx] = { ...zones[idx], ...updates };
    await AsyncStorage.setItem(ZONES_KEY, JSON.stringify(zones));
    await this._restartMonitoring();
    return zones[idx];
  }

  async deleteZone(id) {
    const zones = (await this.getZones()).filter(z => z.id !== id);
    await AsyncStorage.setItem(ZONES_KEY, JSON.stringify(zones));
    await this._restartMonitoring();
  }

  async getZones() {
    const raw = await AsyncStorage.getItem(ZONES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  // ─── Monitoring ───────────────────────────────────────────────────────────

  async _restartMonitoring() {
    try {
      const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
      if (isRunning) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    } catch (_) {}

    const zones = await this.getZones();
    if (zones.length === 0) return;

    await Location.startGeofencingAsync(GEOFENCE_TASK, zones.map(z => ({
      identifier: z.id,
      latitude: z.latitude,
      longitude: z.longitude,
      radius: z.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    })));
  }

  // ─── Current zone detection (foreground) ──────────────────────────────────
  async getCurrentZone(coords) {
    const zones = await this.getZones();
    for (const zone of zones) {
      const dist = this._haversine(coords.latitude, coords.longitude, zone.latitude, zone.longitude);
      if (dist <= zone.radius) return zone;
    }
    return null;
  }

  // ─── Event log ────────────────────────────────────────────────────────────
  async _logEvent(entry) {
    const raw = await AsyncStorage.getItem('geofence_events') || '[]';
    const events = JSON.parse(raw);
    events.unshift(entry);
    await AsyncStorage.setItem('geofence_events', JSON.stringify(events.slice(0, 100)));
  }

  async getEventLog() {
    const raw = await AsyncStorage.getItem('geofence_events');
    return raw ? JSON.parse(raw) : [];
  }

  // ─── Haversine distance (metres) ─────────────────────────────────────────
  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

export const GeofencingService = new _GeofencingService();
