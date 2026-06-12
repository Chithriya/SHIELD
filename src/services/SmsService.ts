/**
 * SmsService — automatic SMS to all emergency contacts
 *
 * expo-sms on Android opens the SMS compose screen pre-filled.
 * On most Android versions the SMS fires as soon as the intent is sent.
 *
 * SKIP_POLICE_112: set false for production so Police 112 is always alerted.
 */

import * as SMS from 'expo-sms';
import { Linking } from 'react-native';
import { storage } from './StorageService';
import { getMapsLink, getCoords } from './LocationService';
import { TriggerType } from '../constants/types';

const SKIP_POLICE_112 = false;   // ← PRODUCTION: police always notified

function formatPhone(p: string): string {
  const clean = p.replace(/[\s\-]/g, '');
  if (clean === '112' || clean === '100' || clean === '108') return clean;
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('91') && clean.length === 12) return '+' + clean;
  if (clean.length === 10) return '+91' + clean;
  return clean;
}

function isEmergencyNumber(phone: string): boolean {
  const clean = phone.replace(/[\s\-]/g, '');
  return clean === '112' || clean === '100' || clean === '108';
}

class SmsService {

  async sendSosAlerts(lat: number, lng: number, trigger: TriggerType): Promise<void> {
    const contacts = await storage.getContacts();
    if (!contacts.length) {
      console.warn('[SHIELD] No contacts configured');
      return;
    }

    const name    = (await storage.getUserName()) || 'Someone';
    const link    = getMapsLink(lat, lng);
    const coords  = getCoords(lat, lng);
    const time    = new Date().toLocaleString('en-IN');
    const trigStr = trigger.replace(/_/g, ' ');

    const message =
      `🆘 SHIELD EMERGENCY ALERT\n\n` +
      `${name} needs immediate help!\n\n` +
      `📍 Location: ${link}\n` +
      `🗺 GPS: ${coords}\n` +
      `⏰ Time: ${time}\n` +
      `🔔 Trigger: ${trigStr}\n\n` +
      `⚠️ Please call or go to them NOW!\n` +
      `(Sent by SHIELD Safety App)`;

    const regularContacts = contacts.filter(c => !isEmergencyNumber(c.phone));
    const policeContacts  = contacts.filter(c => isEmergencyNumber(c.phone));

    console.log(`[SHIELD] Sending SOS — regular:${regularContacts.length} police:${policeContacts.length}`);

    // ── Regular contacts — one SMS compose with all recipients ───────────
    if (regularContacts.length > 0) {
      const phones = regularContacts.map(c => formatPhone(c.phone));
      try {
        const isAvailable = await SMS.isAvailableAsync();
        if (isAvailable) {
          const { result } = await SMS.sendSMSAsync(phones, message);
          console.log('[SHIELD] SMS result:', result);
        } else {
          await this.fallbackSms(phones[0], message);
        }
      } catch (e) {
        console.warn('[SHIELD] SMS error:', e);
        if (regularContacts[0]) {
          await this.fallbackSms(formatPhone(regularContacts[0].phone), message);
        }
      }
    }

    // ── Police 112 ────────────────────────────────────────────────────────
    if (!SKIP_POLICE_112 && policeContacts.length > 0) {
      try {
        await SMS.sendSMSAsync(['112'], message);
      } catch (e) {
        console.warn('[SHIELD] Police SMS failed:', e);
      }
    }
  }

  // Live update goes to ALL regular contacts (not just primary)
  async sendLiveUpdate(lat: number, lng: number): Promise<void> {
    const contacts = await storage.getContacts();
    const regular  = contacts.filter(c => !isEmergencyNumber(c.phone));
    if (!regular.length) return;

    const name = (await storage.getUserName()) || 'User';
    const link = getMapsLink(lat, lng);
    const time = new Date().toLocaleString('en-IN');

    const msg =
      `📍 SHIELD Live Location Update\n\n` +
      `${name} — SOS still active\n` +
      `🗺 Location: ${link}\n` +
      `⏰ Updated: ${time}\n\n` +
      `(Auto-update every 1 min)`;

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        const phones = regular.map(c => formatPhone(c.phone));
        await SMS.sendSMSAsync(phones, msg);
        console.log('[SHIELD] Live update sent to', phones.length, 'contacts');
      }
    } catch (e) {
      console.warn('[SHIELD] Live update SMS failed:', e);
    }
  }

  private async fallbackSms(phone: string, body: string): Promise<void> {
    try {
      const encoded = encodeURIComponent(body);
      await Linking.openURL(`sms:${phone}?body=${encoded}`);
    } catch (e) {
      console.warn('[SHIELD] Fallback SMS failed:', e);
    }
  }
}

export const smsService = new SmsService();
