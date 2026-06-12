// src/screens/NearbyServicesScreen.js
// Combined Police Station + Hospital locator
// Interactive map, distance calculation, estimated travel time

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Linking, Modal, Dimensions, Platform,
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS = 5000; // metres

// ─── Hardcoded fallback data (India-wide) ────────────────────────────────────
const FALLBACK_POLICE = [
  { id: 'p1', name: 'Local Police Station', phone: '100', latitude: null, longitude: null, isFallback: true },
];
const FALLBACK_HOSPITALS = [
  { id: 'h1', name: 'Government Hospital', phone: '108', latitude: null, longitude: null, isFallback: true },
  { id: 'h2', name: 'Ambulance Service', phone: '102', latitude: null, longitude: null, isFallback: true },
];
const AMBULANCE_CONTACTS = [
  { name: 'National Ambulance', number: '108' },
  { name: 'CATS Ambulance (Delhi)', number: '1099' },
  { name: 'Government Ambulance', number: '102' },
];

// ─── Overpass query builder ──────────────────────────────────────────────────
const buildQuery = (lat, lon, radius, amenity) =>
  `[out:json][timeout:15];(node["amenity"="${amenity}"](around:${radius},${lat},${lon});way["amenity"="${amenity}"](around:${radius},${lat},${lon}););out center 20;`;

export default function NearbyServicesScreen() {
  const [tab, setTab] = useState('police'); // 'police' | 'hospital'
  const [userLocation, setUserLocation] = useState(null);
  const [policeStations, setPoliceStations] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    _init();
  }, []);

  const _init = async () => {
    setLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      // Use fallbacks
      setPoliceStations(FALLBACK_POLICE);
      setHospitals(FALLBACK_HOSPITALS);
      setLoading(false);
      return;
    }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setUserLocation(loc.coords);
    await AsyncStorage.setItem('last_known_location', JSON.stringify(loc.coords));

    // Try cache first
    const cached = await _loadCache(loc.coords);
    if (cached) {
      setPoliceStations(cached.police);
      setHospitals(cached.hospitals);
      setCachedAt(cached.at);
      setLoading(false);
      return;
    }

    await _fetchAll(loc.coords);
    setLoading(false);
  };

  const _fetchAll = async (coords) => {
    const [police, hosp] = await Promise.all([
      _fetchAmenity(coords, 'police'),
      _fetchAmenity(coords, 'hospital'),
    ]);
    const processedPolice = _processResults(police, coords, 'police');
    const processedHosp = _processResults(hosp, coords, 'hospital');
    setPoliceStations(processedPolice.length > 0 ? processedPolice : FALLBACK_POLICE);
    setHospitals(processedHosp.length > 0 ? processedHosp : FALLBACK_HOSPITALS);
    await _saveCache(processedPolice, processedHosp);
    setCachedAt(Date.now());
  };

  const _fetchAmenity = async (coords, amenity) => {
    try {
      const query = buildQuery(coords.latitude, coords.longitude, SEARCH_RADIUS, amenity);
      const res = await fetch(OVERPASS_URL, {
        method: 'POST', body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return data.elements || [];
    } catch (e) {
      console.warn(`[NearbyServices] Fetch ${amenity} error:`, e.message);
      return [];
    }
  };

  const _processResults = (elements, userCoords, type) => {
    return elements.map((el, idx) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const dist = (lat && lon) ? _haversine(userCoords.latitude, userCoords.longitude, lat, lon) : null;
      return {
        id: `${type}_${el.id ?? idx}`,
        type,
        name: el.tags?.name || (type === 'police' ? 'Police Station' : 'Hospital'),
        phone: el.tags?.phone || el.tags?.['contact:phone'] || (type === 'police' ? '100' : '108'),
        website: el.tags?.website,
        latitude: lat,
        longitude: lon,
        distance: dist,
        travelTimeWalk: dist ? Math.round(dist / 80) : null,   // ~80 m/min walking
        travelTimeDrive: dist ? Math.round(dist / 500) : null, // ~500 m/min driving
        emergency: el.tags?.emergency,
        beds: el.tags?.beds,
      };
    }).filter(p => p.latitude).sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
  };

  // ─── Cache ────────────────────────────────────────────────────────────────
  const _saveCache = async (police, hospitals) => {
    const data = { police, hospitals, at: Date.now() };
    await AsyncStorage.setItem('nearby_services_cache', JSON.stringify(data));
  };

  const _loadCache = async (coords) => {
    try {
      const raw = await AsyncStorage.getItem('nearby_services_cache');
      if (!raw) return null;
      const cached = JSON.parse(raw);
      const age = Date.now() - cached.at;
      if (age > 3600000) return null; // 1 hour TTL
      // Re-calculate distances for current position
      cached.police = cached.police.map(p => ({
        ...p,
        distance: p.latitude ? _haversine(coords.latitude, coords.longitude, p.latitude, p.longitude) : null,
      })).sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
      cached.hospitals = cached.hospitals.map(h => ({
        ...h,
        distance: h.latitude ? _haversine(coords.latitude, coords.longitude, h.latitude, h.longitude) : null,
      })).sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
      return cached;
    } catch { return null; }
  };

  const refresh = async () => {
    await AsyncStorage.removeItem('nearby_services_cache');
    setLoading(true);
    if (userLocation) await _fetchAll(userLocation);
    setLoading(false);
  };

  // ─── Distance helpers ─────────────────────────────────────────────────────
  const _haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const _formatDist = (m) => {
    if (!m) return '—';
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  // ─── Map helpers ──────────────────────────────────────────────────────────
  const focusItem = (item) => {
    if (!item.latitude) return;
    setViewMode('map');
    setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: item.latitude, longitude: item.longitude,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 600);
    }, 200);
  };

  const openInMaps = (item) => {
    if (!item.latitude) return;
    const url = Platform.OS === 'ios'
      ? `maps://app?daddr=${item.latitude},${item.longitude}`
      : `google.navigation:q=${item.latitude},${item.longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${item.latitude},${item.longitude}`)
    );
  };

  const callNumber = (number) => {
    Linking.openURL(`tel:${number}`);
  };

  // ─── Render list item ─────────────────────────────────────────────────────
  const items = tab === 'police' ? policeStations : hospitals;
  const isPolice = tab === 'police';

  const renderItem = ({ item, index }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => { setSelectedItem(item); setDetailVisible(true); }}
      activeOpacity={0.85}
    >
      <View style={[styles.indexBadge, { backgroundColor: isPolice ? '#1A237E' : '#1B5E20' }]}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        {item.distance != null && (
          <View style={styles.cardMeta}>
            <Ionicons name="location-outline" size={12} color="#666" />
            <Text style={styles.metaText}>{_formatDist(item.distance)} away</Text>
            <Ionicons name="walk-outline" size={12} color="#666" style={{ marginLeft: 8 }} />
            <Text style={styles.metaText}>{item.travelTimeWalk ?? '—'} min walk</Text>
            <Ionicons name="car-outline" size={12} color="#666" style={{ marginLeft: 8 }} />
            <Text style={styles.metaText}>{item.travelTimeDrive ?? '—'} min drive</Text>
          </View>
        )}
        {item.isFallback && (
          <Text style={styles.fallbackNote}>Offline fallback — dial the number below</Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => callNumber(item.phone)} style={styles.callBtn}>
          <Ionicons name="call" size={16} color="#fff" />
        </TouchableOpacity>
        {!item.isFallback && (
          <TouchableOpacity onPress={() => focusItem(item)} style={styles.mapBtn}>
            <Ionicons name="map" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'police' && styles.tabActive]}
          onPress={() => setTab('police')}
        >
          <Text style={styles.tabEmoji}>🚔</Text>
          <Text style={[styles.tabText, tab === 'police' && styles.tabTextActive]}>Police</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'hospital' && styles.tabActiveGreen]}
          onPress={() => setTab('hospital')}
        >
          <Text style={styles.tabEmoji}>🏥</Text>
          <Text style={[styles.tabText, tab === 'hospital' && styles.tabTextActive]}>Hospitals</Text>
        </TouchableOpacity>
      </View>

      {/* View toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleActive]}
          onPress={() => setViewMode('list')}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? '#fff' : '#666'} />
          <Text style={[styles.toggleText, viewMode === 'list' && { color: '#fff' }]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'map' && styles.toggleActive]}
          onPress={() => setViewMode('map')}
        >
          <Ionicons name="map-outline" size={16} color={viewMode === 'map' ? '#fff' : '#666'} />
          <Text style={[styles.toggleText, viewMode === 'map' && { color: '#fff' }]}>Map</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={16} color="#aaa" />
        </TouchableOpacity>
      </View>

      {/* Cache age */}
      {cachedAt && (
        <Text style={styles.cacheNote}>
          Data cached {Math.round((Date.now() - cachedAt) / 60000)} min ago • Pull to refresh
        </Text>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E53935" />
          <Text style={styles.loadingText}>Finding nearby {isPolice ? 'police stations' : 'hospitals'}…</Text>
        </View>
      ) : viewMode === 'list' ? (
        <>
          {/* Ambulance quick-dial for hospital tab */}
          {tab === 'hospital' && (
            <View style={styles.ambulanceRow}>
              <Text style={styles.ambulanceTitle}>🚑 Quick Ambulance Dial</Text>
              <View style={styles.ambulanceBtns}>
                {AMBULANCE_CONTACTS.map(a => (
                  <TouchableOpacity key={a.number} style={styles.ambulanceBtn} onPress={() => callNumber(a.number)}>
                    <Text style={styles.ambulanceNum}>{a.number}</Text>
                    <Text style={styles.ambulanceName}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No {isPolice ? 'police stations' : 'hospitals'} found nearby</Text>
            }
          />
        </>
      ) : (
        /* Map view */
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: userLocation?.latitude ?? 13.0827,
            longitude: userLocation?.longitude ?? 80.2707,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          showsUserLocation
          showsMyLocationButton
        >
          {items.filter(i => i.latitude).map(item => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              pinColor={isPolice ? '#1A237E' : '#1B5E20'}
              onPress={() => { setSelectedItem(item); setDetailVisible(true); }}
            >
              <Callout tooltip>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutName}>{item.name}</Text>
                  <Text style={styles.calloutDist}>{_formatDist(item.distance)}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      {/* Detail modal */}
      <Modal visible={detailVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setDetailVisible(false)}>
          <View style={styles.detailModal}>
            <Text style={styles.detailName}>{selectedItem?.name}</Text>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={14} color="#aaa" />
              <Text style={styles.detailValue}>{_formatDist(selectedItem?.distance)} away</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="walk" size={14} color="#aaa" />
              <Text style={styles.detailValue}>~{selectedItem?.travelTimeWalk ?? '—'} min walk</Text>
              <Text style={styles.detailSep}> • </Text>
              <Ionicons name="car" size={14} color="#aaa" />
              <Text style={styles.detailValue}>~{selectedItem?.travelTimeDrive ?? '—'} min drive</Text>
            </View>
            <View style={styles.detailBtns}>
              <TouchableOpacity style={styles.detailCallBtn} onPress={() => callNumber(selectedItem?.phone)}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.detailBtnText}>Call {selectedItem?.phone}</Text>
              </TouchableOpacity>
              {!selectedItem?.isFallback && (
                <TouchableOpacity style={styles.detailNavBtn} onPress={() => openInMaps(selectedItem)}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.detailBtnText}>Navigate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },

  tabBar: {
    flexDirection: 'row', paddingTop: 56, paddingHorizontal: 16, gap: 10,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#161616', borderWidth: 1.5, borderColor: '#222',
  },
  tabActive: { borderColor: '#3949AB', backgroundColor: '#1A237E22' },
  tabActiveGreen: { borderColor: '#388E3C', backgroundColor: '#1B5E2022' },
  tabEmoji: { fontSize: 18 },
  tabText: { color: '#666', fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  viewToggle: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#161616',
  },
  toggleActive: { backgroundColor: '#333' },
  toggleText: { color: '#666', fontSize: 13, fontWeight: '600' },
  refreshBtn: { marginLeft: 'auto', padding: 8 },

  cacheNote: { color: '#444', fontSize: 11, paddingHorizontal: 16, marginBottom: 4 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14 },

  ambulanceRow: {
    backgroundColor: '#1B5E2022', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#388E3C',
  },
  ambulanceTitle: { color: '#A5D6A7', fontWeight: '700', fontSize: 13, marginBottom: 8 },
  ambulanceBtns: { flexDirection: 'row', gap: 8 },
  ambulanceBtn: {
    flex: 1, backgroundColor: '#1B5E20', borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  ambulanceNum: { color: '#fff', fontWeight: '800', fontSize: 18 },
  ambulanceName: { color: '#A5D6A7', fontSize: 10, marginTop: 2, textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#161616', borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  indexBadge: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  indexText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cardBody: { flex: 1 },
  cardName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  metaText: { color: '#666', fontSize: 11, marginLeft: 2 },
  fallbackNote: { color: '#FF9800', fontSize: 11, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 6 },
  callBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center',
  },
  mapBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1A237E', justifyContent: 'center', alignItems: 'center',
  },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 14 },

  map: { flex: 1 },
  calloutBox: {
    backgroundColor: '#1A1A1A', padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#333', minWidth: 160,
  },
  calloutName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  calloutDist: { color: '#aaa', fontSize: 12, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detailModal: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  detailName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailValue: { color: '#aaa', fontSize: 13 },
  detailSep: { color: '#555' },
  detailBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  detailCallBtn: {
    flex: 1, backgroundColor: '#E53935', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 12,
  },
  detailNavBtn: {
    flex: 1, backgroundColor: '#1A237E', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 12,
  },
  detailBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
