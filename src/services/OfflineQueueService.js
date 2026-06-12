// src/services/OfflineQueueService.js
// Queues failed SOS alerts locally and auto-sends when connectivity returns

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'sos_offline_queue';

class _OfflineQueueService {
  _unsubscribeNetInfo = null;

  initialize() {
    // Watch connectivity — flush queue the moment we come online
    this._unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        this._flushQueue();
      }
    });
  }

  async enqueue(item) {
    const queue = await this._loadQueue();
    queue.push({ ...item, queuedAt: Date.now(), attempts: 0 });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineQueue] Queued alert. Queue size: ${queue.length}`);
  }

  async _flushQueue() {
    const queue = await this._loadQueue();
    if (queue.length === 0) return;

    console.log(`[OfflineQueue] Flushing ${queue.length} queued alerts`);
    const remaining = [];

    for (const item of queue) {
      try {
        // Lazy import to avoid circular dependency
        const { EmergencyMessagingService } = await import('./EmergencyMessagingService');
        await EmergencyMessagingService.sendSOSAlert(
          item.contacts,
          item.location,
          { retrying: true }
        );
        console.log(`[OfflineQueue] Flushed alert ${item.alertId}`);
      } catch (e) {
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts < 5) {
          remaining.push(item); // keep in queue for next attempt
        } else {
          console.warn(`[OfflineQueue] Dropping alert ${item.alertId} after 5 attempts`);
        }
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  }

  async getQueueSize() {
    const queue = await this._loadQueue();
    return queue.length;
  }

  async clearQueue() {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }

  async _loadQueue() {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  destroy() {
    this._unsubscribeNetInfo?.();
  }
}

export const OfflineQueueService = new _OfflineQueueService();
