// src/screens/LiveTrackingScreen.js
// Real-time tracking dashboard: live map, movement trail, battery, geofence zones

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Share, Alert, Switch,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { GeofencingService } from '../services/GeofencingService';

const TRAIL_MAX = 100;       // max GPS points to keep
const UPDATE_INTERVAL = 8000; // ms

export default function LiveTrackingScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [trail, setTrail] = useState([]);
  const [battery, setBattery] = useState(null);
  const [zones, setZones] = useState([]);
  const [currentZone, setCurrentZone] = useState(null);
  const [sharingActive, setSharingActive] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [tracking, setTracking] = useState(true);

  const mapRef = useRef(null);
  const watcherRef = useRef(null);
  const batterySubRef = useRef(null);

  useEffect(() => {
    _init();
    return _cleanup;
  }, []);

  const _init = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    // Battery
    const level = await Battery.getBatteryLevelAsync();
    setBattery(Math.round(level * 100));
    batterySubRef.current = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBattery(Math.round(batteryLevel * 100));
    });

    // Load trail from storage
    const savedTrail = await AsyncStorage.getItem('movement_trail');
    if (savedTrail) setTrail(JSON.parse(savedTrail));

    // Load zones
    const z = await GeofencingService.getZones();
    setZones(z);

    // Start watching
    _startWatch();
  };

  const _startWatch = async () => {
    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: UPDATE_INTERVAL,
        distanceInterval: 15,
      },
      async (loc) => {
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          timestamp: loc.timestamp,
        };
        setLocation(coords);
        await AsyncStorage.setItem('last_known_location', JSON.stringify(coords));

        setTrail(prev => {
          const updated = [...prev, coords].slice(-TRAIL_MAX);
          AsyncStorage.setItem('movement_trail', JSON.stringify(updated));
          return updated;
        });

        // Check geofences in foreground
        const zone = await GeofencingService.getCurrentZone(coords);
        setCurrentZone(zone);

        // Centre map
        mapRef.current?.animateToRegion({
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 600);
      }
    );
  };

  const _cleanup = () => {
    watcherRef.current?.remove();
    batterySubRef.current?.remove();
  };

  // ─── Share live location ──────────────────────────────────────────────────
  const shareLocation = async () => {
    if (!location) return;
    const url = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    const link = `🛡️ SHIELD Live Location\n📍 ${url}\n⏰ Updated: ${new Date().toLocaleTimeString('en-IN')}`;
    setShareLink(url);
    setSharingActive(true);
    await Share.share({ message: link, title: 'My Live Location – SHIELD' });
  };

  const clearTrail = async () => {
    Alert.alert('Clear History', 'Clear movement history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          setTrail([]);
          await AsyncStorage.removeItem('movement_trail');
        },
      },
    ]);
  };

  const batteryColor = !battery ? '#666'
    : battery > 50 ? '#4CAF50'
    : battery > 20 ? '#FF9800'
    : '#F44336';

  const ZONE_COLORS = { Home: '#4CAF50', College: '#2196F3', Workplace: '#FF9800', Other: '#9C27B0' };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="standard"
        initialRegion={{
          latitude: location?.latitude ?? 13.0827,
          longitude: location?.longitude ?? 80.2707,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Movement trail */}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor="#E53935"
            strokeWidth={3}
            lineDashPattern={[1]}
          />
        )}

        {/* Current position marker */}
        {location && (
          <Marker
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title="You are here"
            pinColor="#E53935"
          />
        )}

        {/* Safe zone circles */}
        {zones.map(zone => (
          <React.Fragment key={zone.id}>
            <Circle
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={zone.radius}
              fillColor={`${ZONE_COLORS[zone.type] ?? '#9C27B0'}22`}
              strokeColor={ZONE_COLORS[zone.type] ?? '#9C27B0'}
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
              title={zone.name}
              description={`Safe zone (${zone.radius}m)`}
            >
              <View style={[styles.zoneMarker, { backgroundColor: ZONE_COLORS[zone.type] ?? '#9C27B0' }]}>
                <Text style={styles.zoneMarkerText}>
                  {zone.type === 'Home' ? '🏠'
                    : zone.type === 'College' ? '🎓'
                    : zone.type === 'Workplace' ? '💼' : '📍'}
                </Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}
      </MapView>

      {/* Top HUD */}
      <View style={styles.hud}>
        <View style={styles.hudLeft}>
          {currentZone ? (
            <View style={[styles.zonePill, { backgroundColor: `${ZONE_COLORS[currentZone.type] ?? '#9C27B0'}33` }]}>
              <Text style={[styles.zonePillText, { color: ZONE_COLORS[currentZone.type] ?? '#9C27B0' }]}>
                {currentZone.type === 'Home' ? '🏠' : currentZone.type === 'College' ? '🎓' : '💼'} {currentZone.name}
              </Text>
            </View>
          ) : (
            <View style={styles.zonePill}>
              <Text style={styles.zonePillText}>📍 En Route</Text>
            </View>
          )}
        </View>
        <View style={styles.hudRight}>
          <View style={[styles.batteryBadge, { borderColor: batteryColor }]}>
            <Ionicons name="battery-half" size={14} color={batteryColor} />
            <Text style={[styles.batteryText, { color: batteryColor }]}>
              {battery !== null ? `${battery}%` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={styles.panel}>
        <View style={styles.panelRow}>
          <View>
            <Text style={styles.panelLabel}>Location Accuracy</Text>
            <Text style={styles.panelValue}>
              {location ? `±${Math.round(location.accuracy ?? 0)}m` : 'Acquiring…'}
            </Text>
          </View>
          <View>
            <Text style={styles.panelLabel}>Trail Points</Text>
            <Text style={styles.panelValue}>{trail.length}</Text>
          </View>
          <View>
            <Text style={styles.panelLabel}>Safe Zones</Text>
            <Text style={styles.panelValue}>{zones.length}</Text>
          </View>
        </View>

        <View style={styles.panelActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={shareLocation}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Share Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1A237E' }]}
            onPress={() => navigation.navigate('SafeZones')}>
            <Ionicons name="shield" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Manage Zones</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#212121' }]} onPress={clearTrail}>
            <Ionicons name="trash" size={18} color="#aaa" />
            <Text style={[styles.actionBtnText, { color: '#aaa' }]}>Clear Trail</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  map: { flex: 1 },

  hud: {
    position: 'absolute', top: 52, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  hudLeft: {},
  hudRight: {},
  zonePill: {
    backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
  },
  zonePillText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  batteryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1A1A1A', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  batteryText: { fontSize: 12, fontWeight: '600' },

  zoneMarker: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  zoneMarkerText: { fontSize: 16 },

  panel: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  panelRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: 16,
  },
  panelLabel: { color: '#666', fontSize: 11, textAlign: 'center' },
  panelValue: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  panelActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E53935', paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
