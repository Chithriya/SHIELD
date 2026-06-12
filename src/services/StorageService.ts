import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmergencyContact } from '../constants/types';

const K = {
  ONBOARDED:     'shield_onboarded',
  NAME:          'shield_user_name',
  PHONE:         'shield_user_phone',
  BLOOD:         'shield_blood_group',
  MEDICAL:       'shield_medical',
  CONTACTS:      'shield_contacts',
  VOICE_PHRASE:  'shield_voice_phrase',
  FAKENAME:      'shield_fake_call_name',
  SMS_FALLBACK:  'shield_sms_fallback',
  VOLUNTEER:     'shield_volunteer',
  VOICE_ENABLED: 'shield_voice_enabled',
};

// Default police contact always included
export const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id:        'police_112',
    name:      'Police 112',
    phone:     '112',
    relation:  'Emergency Services',
    isPrimary: false,
  },
];

class StorageService {
  async isOnboarded(): Promise<boolean> {
    return (await AsyncStorage.getItem(K.ONBOARDED)) === 'true';
  }
  async setOnboarded(v: boolean) {
    await AsyncStorage.setItem(K.ONBOARDED, String(v));
  }

  async getUserName(): Promise<string> {
    return (await AsyncStorage.getItem(K.NAME)) ?? '';
  }
  async setUserName(v: string) { await AsyncStorage.setItem(K.NAME, v); }

  async getUserPhone(): Promise<string> {
    return (await AsyncStorage.getItem(K.PHONE)) ?? '';
  }
  async setUserPhone(v: string) { await AsyncStorage.setItem(K.PHONE, v); }

  async getBloodGroup(): Promise<string> {
    return (await AsyncStorage.getItem(K.BLOOD)) ?? '';
  }
  async setBloodGroup(v: string) { await AsyncStorage.setItem(K.BLOOD, v); }

  async getMedicalNotes(): Promise<string> {
    return (await AsyncStorage.getItem(K.MEDICAL)) ?? '';
  }
  async setMedicalNotes(v: string) { await AsyncStorage.setItem(K.MEDICAL, v); }

  async getContacts(): Promise<EmergencyContact[]> {
    const json = await AsyncStorage.getItem(K.CONTACTS);
    let contacts: EmergencyContact[] = [];
    if (json) {
      try { contacts = JSON.parse(json); } catch { contacts = []; }
    }
    // Always ensure Police 112 is included
    const hasPolice = contacts.some(c => c.id === 'police_112');
    if (!hasPolice) {
      contacts = [...contacts, ...DEFAULT_CONTACTS];
    }
    return contacts;
  }

  async saveContacts(contacts: EmergencyContact[]) {
    await AsyncStorage.setItem(K.CONTACTS, JSON.stringify(contacts));
  }

  async getVoicePhrase(): Promise<string> {
    return (await AsyncStorage.getItem(K.VOICE_PHRASE)) ?? '';
  }
  async setVoicePhrase(v: string) {
    await AsyncStorage.setItem(K.VOICE_PHRASE, v);
  }

  async getFakeCallName(): Promise<string> {
    return (await AsyncStorage.getItem(K.FAKENAME)) ?? 'Amma';
  }
  async setFakeCallName(v: string) { await AsyncStorage.setItem(K.FAKENAME, v); }

  async getSmsFallback(): Promise<boolean> {
    return (await AsyncStorage.getItem(K.SMS_FALLBACK)) !== 'false';
  }
  async setSmsFallback(v: boolean) {
    await AsyncStorage.setItem(K.SMS_FALLBACK, String(v));
  }

  async getVolunteerMode(): Promise<boolean> {
    return (await AsyncStorage.getItem(K.VOLUNTEER)) === 'true';
  }
  async setVolunteerMode(v: boolean) {
    await AsyncStorage.setItem(K.VOLUNTEER, String(v));
  }

  async getVoiceEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(K.VOICE_ENABLED)) !== 'false';
  }
  async setVoiceEnabled(v: boolean) {
    await AsyncStorage.setItem(K.VOICE_ENABLED, String(v));
  }
}

export const storage = new StorageService();
