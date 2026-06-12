import * as Location from 'expo-location';

export interface LocationResult {
  lat: number;
  lng: number;
  success: boolean;
}

export function getMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export function getCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

class LocationService {
  private last: { lat: number; lng: number } | null = null;
  private watchSubscription: Location.LocationSubscription | null = null;
  private liveCallback: ((lat: number, lng: number) => void) | null = null;
  private smsInterval: ReturnType<typeof setInterval> | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    await Location.requestBackgroundPermissionsAsync();
    return true;
  }

  async getLocation(): Promise<LocationResult> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') await this.requestPermissions();

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      this.last = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };
      return { ...this.last, success: true };
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          this.last = {
            lat: last.coords.latitude,
            lng: last.coords.longitude,
          };
          return { ...this.last, success: true };
        }
      } catch {}
    }
    return { lat: 0, lng: 0, success: false };
  }

  // Start continuous live tracking during SOS
  async startLiveTracking(
    callback: (lat: number, lng: number) => void,
    onSmsTick?: (lat: number, lng: number) => void
  ) {
    this.liveCallback = callback;
    this.watchSubscription = await Location.watchPositionAsync(
      {
        accuracy:         Location.Accuracy.High,
        timeInterval:     5000,
        distanceInterval: 10,
      },
      (loc) => {
        this.last = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };
        this.liveCallback?.(loc.coords.latitude, loc.coords.longitude);
      }
    );

    // Send live SMS every 60 seconds (first tick at 60s, not immediately,
    // since the initial SOS SMS already contains the location)
    if (onSmsTick) {
      this.smsInterval = setInterval(() => {
        if (this.last) {
          onSmsTick(this.last.lat, this.last.lng);
        }
      }, 60000);
    }
  }

  // Subscribe to existing live tracking without restarting it
  subscribeToLocation(callback: (lat: number, lng: number) => void): () => void {
    this.liveCallback = callback;
    if (this.last) {
      callback(this.last.lat, this.last.lng);
    }
    return () => {
      if (this.liveCallback === callback) {
        this.liveCallback = null;
      }
    };
  }

  stopLiveTracking() {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
    if (this.smsInterval) {
      clearInterval(this.smsInterval);
      this.smsInterval = null;
    }
    this.liveCallback = null;
  }

  getLastLocation() { return this.last; }
}

export const locationService = new LocationService();
