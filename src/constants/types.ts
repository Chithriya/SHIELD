export interface EmergencyContact {
  id:        string;
  name:      string;
  phone:     string;
  relation:  string;
  isPrimary: boolean;
}

export interface AlertEvent {
  id:          string;
  latitude:    number;
  longitude:   number;
  timestamp:   number;
  triggerType: TriggerType;
  resolved:    boolean;
  audioPath?:  string;
  photoPath?:  string;
}

export type TriggerType =
  | 'MANUAL'
  | 'VOICE_TRIGGER'
  | 'VOLUME_BUTTON'
  | 'SHAKE';

export interface UserProfile {
  name:               string;
  phone:              string;
  bloodGroup:         string;
  medicalNotes:       string;
  voiceTriggerPhrase: string;
  fakeCallName:       string;
  smsFallback:        boolean;
  volunteerMode:      boolean;
}

export interface HelplineEntry {
  id:       string;
  name:     string;
  number:   string;
  icon:     string;
  type:     'call' | 'whatsapp' | 'sms' | 'web';
}
