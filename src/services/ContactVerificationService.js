// src/services/ContactVerificationService.js
// Verifies emergency contacts during setup by sending a test message
// and tracks their confirmation / availability status

import * as SMS from 'expo-sms';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VERIFICATION_KEY = 'contact_verification_status';

export const VerificationStatus = {
  UNVERIFIED: 'unverified',
  TEST_SENT: 'test_sent',
  VERIFIED: 'verified',        // contact replied (future push/webhook feature)
  FAILED: 'failed',
};

class _ContactVerificationService {
  async sendVerificationMessage(contact) {
    const msg =
      `Hi ${contact.name}! You've been added as an emergency contact on SHIELD Women Safety App ` +
      `by someone who trusts you. If they ever need help, you'll receive an SOS alert. ` +
      `Please save this number. Stay safe! 💙`;

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        await this._setStatus(contact.id, VerificationStatus.FAILED, 'SMS unavailable');
        return false;
      }
      const { result } = await SMS.sendSMSAsync([contact.phone], msg);
      const success = result === 'sent' || result === 'unknown';
      await this._setStatus(
        contact.id,
        success ? VerificationStatus.TEST_SENT : VerificationStatus.FAILED,
        success ? null : 'SMS send failed'
      );
      return success;
    } catch (e) {
      await this._setStatus(contact.id, VerificationStatus.FAILED, e.message);
      return false;
    }
  }

  async getStatus(contactId) {
    const all = await this._loadAll();
    return all[contactId] ?? { status: VerificationStatus.UNVERIFIED, detail: null, at: null };
  }

  async getAllStatuses() {
    return await this._loadAll();
  }

  // Mark a contact as manually verified (e.g. user confirmed verbally)
  async markVerified(contactId) {
    await this._setStatus(contactId, VerificationStatus.VERIFIED);
  }

  async removeContact(contactId) {
    const all = await this._loadAll();
    delete all[contactId];
    await AsyncStorage.setItem(VERIFICATION_KEY, JSON.stringify(all));
  }

  async _setStatus(contactId, status, detail = null) {
    const all = await this._loadAll();
    all[contactId] = { status, detail, at: Date.now() };
    await AsyncStorage.setItem(VERIFICATION_KEY, JSON.stringify(all));
  }

  async _loadAll() {
    const raw = await AsyncStorage.getItem(VERIFICATION_KEY);
    return raw ? JSON.parse(raw) : {};
  }
}

export const ContactVerificationService = new _ContactVerificationService();
