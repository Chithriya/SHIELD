// src/services/EmergencyMessagingService.js
// Multi-channel SOS delivery: SMS → WhatsApp → Email → Push
// Tracks delivery status per contact per channel with automatic retry

import * as SMS from 'expo-sms';
import * as MailComposer from 'expo-mail-composer';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineQueueService } from './OfflineQueueService';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export const DeliveryStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  DELIVERED: 'delivered', // future: read receipts
};

class _EmergencyMessagingService {
  // ─── Main entry: send SOS through all channels ───────────────────────────

  async sendSOSAlert(contacts, location, options = {}) {
    const alertId = `sos_${Date.now()}`;
    const message = this._buildMessage(location, options);

    // Initialise status tracker in storage
    const statusMap = {};
    for (const contact of contacts) {
      statusMap[contact.id] = {
        name: contact.name,
        sms: DeliveryStatus.PENDING,
        whatsapp: DeliveryStatus.PENDING,
        email: contact.email ? DeliveryStatus.PENDING : 'n/a',
        lastAttempt: null,
        retries: 0,
      };
    }
    await AsyncStorage.setItem(`alert_status_${alertId}`, JSON.stringify(statusMap));
    await AsyncStorage.setItem('latest_alert_id', alertId);

    // Fire channels concurrently per contact
    const promises = contacts.map(contact =>
      this._sendToContact(alertId, contact, message, location, statusMap)
    );
    await Promise.allSettled(promises);

    // Persist final status
    await AsyncStorage.setItem(`alert_status_${alertId}`, JSON.stringify(statusMap));

    // Queue any failures for offline retry
    const failedContacts = contacts.filter(c =>
      statusMap[c.id]?.sms === DeliveryStatus.FAILED &&
      statusMap[c.id]?.whatsapp === DeliveryStatus.FAILED
    );
    if (failedContacts.length > 0) {
      await OfflineQueueService.enqueue({ alertId, contacts: failedContacts, message, location });
    }

    return { alertId, statusMap };
  }

  // ─── Per-contact multi-channel sender ────────────────────────────────────

  async _sendToContact(alertId, contact, message, location, statusMap) {
    // 1. Try SMS (primary)
    const smsSent = await this._trySMS(contact, message);
    statusMap[contact.id].sms = smsSent ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
    statusMap[contact.id].lastAttempt = Date.now();
    await this._persistStatus(alertId, statusMap);

    // 2. WhatsApp regardless — belt-and-suspenders approach
    const waSent = await this._tryWhatsApp(contact, message);
    statusMap[contact.id].whatsapp = waSent ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
    await this._persistStatus(alertId, statusMap);

    // 3. Email if available
    if (contact.email) {
      const emailSent = await this._tryEmail(contact, message, location);
      statusMap[contact.id].email = emailSent ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
      await this._persistStatus(alertId, statusMap);
    }

    // 4. Auto-retry SMS if it failed
    if (!smsSent && statusMap[contact.id].retries < MAX_RETRIES) {
      await this._scheduleRetry(alertId, contact, message, location, statusMap);
    }
  }

  // ─── Channel implementations ──────────────────────────────────────────────

  async _trySMS(contact, message) {
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) return false;
      const { result } = await SMS.sendSMSAsync([contact.phone], message);
      return result === 'sent' || result === 'unknown'; // 'unknown' on Android (OS doesn't confirm)
    } catch {
      return false;
    }
  }

  async _tryWhatsApp(contact, message) {
    try {
      const encodedMsg = encodeURIComponent(message);
      const phone = contact.phone.replace(/\D/g, '');
      const url = `whatsapp://send?phone=${phone}&text=${encodedMsg}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) return false;
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }

  async _tryEmail(contact, message, location) {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) return false;
      const result = await MailComposer.composeAsync({
        recipients: [contact.email],
        subject: '🚨 SHIELD SOS ALERT – Immediate Assistance Required',
        body: this._buildEmailBody(contact, message, location),
        isHtml: true,
      });
      return result.status === 'sent';
    } catch {
      return false;
    }
  }

  // ─── Retry logic ──────────────────────────────────────────────────────────

  async _scheduleRetry(alertId, contact, message, location, statusMap) {
    let attempt = statusMap[contact.id].retries + 1;
    const retryOnce = async () => {
      if (attempt > MAX_RETRIES) return;
      const smsSent = await this._trySMS(contact, message);
      statusMap[contact.id].retries = attempt;
      statusMap[contact.id].lastAttempt = Date.now();
      if (smsSent) {
        statusMap[contact.id].sms = DeliveryStatus.SENT;
        await this._persistStatus(alertId, statusMap);
      } else {
        attempt++;
        setTimeout(retryOnce, RETRY_DELAY_MS);
      }
      await this._persistStatus(alertId, statusMap);
    };
    setTimeout(retryOnce, RETRY_DELAY_MS);
  }

  // ─── Status helpers ───────────────────────────────────────────────────────

  async _persistStatus(alertId, statusMap) {
    await AsyncStorage.setItem(`alert_status_${alertId}`, JSON.stringify(statusMap));
  }

  async getAlertStatus(alertId) {
    const raw = await AsyncStorage.getItem(`alert_status_${alertId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async getLatestAlertStatus() {
    const alertId = await AsyncStorage.getItem('latest_alert_id');
    if (!alertId) return null;
    return { alertId, ...(await this.getAlertStatus(alertId)) };
  }

  // ─── Message builders ─────────────────────────────────────────────────────

  _buildMessage(location, options = {}) {
    const loc = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';
    return (
      `🚨 SHIELD SOS ALERT 🚨\n` +
      `I need immediate help!\n` +
      `📍 My location: ${loc}\n` +
      `⏰ Time: ${new Date().toLocaleTimeString('en-IN')}\n` +
      `🔋 ${options.battery ? `Battery: ${options.battery}%` : ''}\n` +
      `Please call me or contact emergency services immediately.`
    );
  }

  _buildEmailBody(contact, message, location) {
    const mapUrl = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : null;
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#E53935;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h1 style="margin:0">🚨 SHIELD Emergency Alert</h1>
        </div>
        <div style="padding:20px;border:1px solid #eee;border-radius:0 0 8px 8px">
          <p>Dear ${contact.name},</p>
          <p style="font-size:16px;font-weight:bold">This is an automated SOS alert. Immediate help is required.</p>
          <pre style="background:#f5f5f5;padding:12px;border-radius:6px">${message}</pre>
          ${mapUrl ? `<a href="${mapUrl}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#E53935;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">📍 View Live Location on Map</a>` : ''}
          <p style="margin-top:20px;color:#888;font-size:13px">Sent by SHIELD Women Safety App</p>
        </div>
      </div>
    `;
  }
}

export const EmergencyMessagingService = new _EmergencyMessagingService();
