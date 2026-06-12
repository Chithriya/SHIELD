// src/services/BackgroundSOSService.js
// Handles background SOS monitoring even when app is minimized or screen locked

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { EmergencyMessagingService } from './EmergencyMessagingService';
import { OfflineQueueService } from './OfflineQueueService';

export const BACKGROUND_SOS_TASK = 'SHIELD_BACKGROUND_SOS';
export const BACKGROUND_LOCATION_TASK = 'SHIELD_BACKGROUND_LOCATION';

// ─── Register Tasks (call once at app root, outside any component) ────────────

TaskManager.defineTask(BACKGROUND_SOS_TASK, async () => {
  try {
    const sosActive = await AsyncStorage.getItem('sos_triggered');
    if (sosActive === 'true') {
      const contacts = JSON.parse(await AsyncStorage.getItem('emergency_contacts') || '[]');
      const lastLocation = JSON.parse(await AsyncStorage.getItem('last_known_location') || 'null');
      if (contacts.length > 0) {
        await EmergencyMessagingService.sendSOSAlert(contacts, lastLocation, { background: true });
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[BackgroundSOS] Task error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  if (data?.locations?.length) {
    const loc = data.locations[0];
    await AsyncStorage.setItem('last_known_location', JSON.stringify({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      timestamp: loc.timestamp,
    }));
  }
});

// ─── BackgroundSOSService ─────────────────────────────────────────────────────

class _BackgroundSOSService {
  _appStateSubscription = null;
  _isRegistered = false;

  async initialize() {
    if (this._isRegistered) return;

    // Request permissions required for background operation
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[BackgroundSOS] Background location permission denied');
    }

    await this._registerBackgroundFetch();
    await this._startBackgroundLocationTracking();
    this._listenAppState();
    this._isRegistered = true;
    console.log('[BackgroundSOS] Initialized');
  }

  async _registerBackgroundFetch() {
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SOS_TASK, {
        minimumInterval: 15 * 60,     // 15 minutes in seconds — Android Doze minimum
        stopOnTerminate: false,
        startOnBoot: true,
      });
    } catch (e) {
      console.warn('[BackgroundSOS] BackgroundFetch register error:', e.message);
    }
  }

  async _startBackgroundLocationTracking() {
    try {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
      if (!isTracking) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,           // ms
          distanceInterval: 20,          // metres
          foregroundService: {
            notificationTitle: 'SHIELD is protecting you',
            notificationBody: 'Safety monitoring is active',
            notificationColor: '#E53935',
          },
          // Android: prevent Doze/battery optimiser from killing the task
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.Other,
          showsBackgroundLocationIndicator: true, // iOS blue bar
        });
      }
    } catch (e) {
      console.warn('[BackgroundSOS] Location tracking start error:', e.message);
    }
  }

  _listenAppState() {
    this._appStateSubscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        // Persist a flag so the background task knows to keep checking
        await AsyncStorage.setItem('app_in_background', 'true');
      } else {
        await AsyncStorage.setItem('app_in_background', 'false');
      }
    });
  }

  // Call this when user triggers SOS — marks the flag for background task pickup
  async triggerSOS() {
    await AsyncStorage.setItem('sos_triggered', 'true');
    await AsyncStorage.setItem('sos_triggered_at', Date.now().toString());
  }

  async cancelSOS() {
    await AsyncStorage.setItem('sos_triggered', 'false');
  }

  async stopAll() {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SOS_TASK);
    } catch (_) {}
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (_) {}
    this._appStateSubscription?.remove();
    this._isRegistered = false;
  }
}

export const BackgroundSOSService = new _BackgroundSOSService();
