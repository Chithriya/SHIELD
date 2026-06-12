import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Linking, Alert, SectionList,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Helpline {
  id:     string;
  name:   string;
  number: string;
  icon:   string;
  type:   'call' | 'whatsapp' | 'sms' | 'web';
  desc?:  string;
}

interface Section {
  title: string;
  data:  Helpline[];
}

const HELPLINES: Section[] = [
  {
    title: '🚨 Critical Emergency',
    data: [
      { id: 'h1',  name: 'Police',                        number: '100',           icon: '🚔', type: 'call', desc: 'Tamil Nadu Police' },
      { id: 'h2',  name: 'Emergency (Unified)',            number: '112',           icon: '🆘', type: 'call', desc: 'Police / Fire / Ambulance' },
      { id: 'h3',  name: 'Ambulance Service',              number: '108',           icon: '🚑', type: 'call', desc: '24/7 Medical Emergency' },
      { id: 'h4',  name: 'Fire and Rescue',                number: '101',           icon: '🚒', type: 'call', desc: 'Fire & Rescue Service' },
    ],
  },
  {
    title: '👩 Women & Child Safety',
    data: [
      { id: 'h5',  name: 'Women Helpline',                 number: '181',           icon: '👩', type: 'call', desc: 'Women in distress' },
      { id: 'h6',  name: 'Child Helpline',                 number: '1098',          icon: '🧒', type: 'call', desc: 'Children in need' },
      { id: 'h7',  name: 'Maternity & Child Welfare',      number: '102',           icon: '🤱', type: 'call', desc: 'Mother & child health' },
    ],
  },
  {
    title: '🏥 Medical & Mental Health',
    data: [
      { id: 'h8',  name: 'Medical / Anti-Suicidal',        number: '104',           icon: '🏥', type: 'call', desc: 'Medical advice & crisis support' },
      { id: 'h9',  name: 'AIDS Center Helpline',           number: '1097',          icon: '🎗️', type: 'call' },
    ],
  },
  {
    title: '⚠️ Disaster & Safety',
    data: [
      { id: 'h10', name: 'State Disaster Helpline',        number: '1070',          icon: '🌪️', type: 'call' },
      { id: 'h11', name: 'District Disaster Helpline',     number: '1077',          icon: '🏚️', type: 'call' },
      { id: 'h12', name: 'TN Coastal Helpline',            number: '1093',          icon: '🌊', type: 'call' },
      { id: 'h13', name: 'Gas Leakage Helpline',           number: '1906',          icon: '⛽', type: 'call' },
    ],
  },
  {
    title: '🛡️ Cyber & Financial Fraud',
    data: [
      { id: 'h14', name: 'Cyber Financial Fraud',          number: '1930',          icon: '💻', type: 'call', desc: 'Report online fraud' },
      { id: 'h15', name: 'Vigilance & Anti-Corruption',   number: '04422321085',   icon: '🔍', type: 'call' },
    ],
  },
  {
    title: '🚂 Railway & Transport',
    data: [
      { id: 'h16', name: 'TN Railway Police',              number: '1512',          icon: '🚂', type: 'call' },
      { id: 'h17', name: 'Central RPF Helpline',           number: '182',           icon: '🚉', type: 'call' },
      { id: 'h18', name: 'General Railway Enquiry',        number: '139',           icon: '🚃', type: 'call' },
    ],
  },
  {
    title: '🏛️ Government Services',
    data: [
      { id: 'h19', name: 'Senior Citizen Helpline',        number: '14567',         icon: '👴', type: 'call' },
      { id: 'h20', name: 'Student & Exam Helpline',        number: '14417',         icon: '📚', type: 'call' },
      { id: 'h21', name: 'Chennai Corporation',            number: '1913',          icon: '🏙️', type: 'call' },
      { id: 'h22', name: 'EB Helpline',                    number: '94987 94987',   icon: '⚡', type: 'call' },
      { id: 'h23', name: 'Animal Emergency',               number: '1962',          icon: '🐾', type: 'call' },
      { id: 'h24', name: 'Mortuary',                       number: '155377',        icon: '🏥', type: 'call' },
    ],
  },
  {
    title: '📱 Online Complaint (TN Police)',
    data: [
      { id: 'h25', name: 'WhatsApp Complaint',             number: '+917997700100', icon: '💬', type: 'whatsapp', desc: 'Send on WhatsApp' },
      { id: 'h26', name: 'SMS Complaint',                  number: '7997700100',    icon: '📩', type: 'sms',      desc: 'Send SMS complaint' },
      { id: 'h27', name: 'Facebook Police Complaint',      number: '@tnpdial100',   icon: '📘', type: 'web',      desc: 'facebook.com/tnpdial100' },
      { id: 'h28', name: 'Twitter Police Complaint',       number: '@tnpdial100',   icon: '🐦', type: 'web',      desc: 'twitter.com/tnpdial100' },
    ],
  },
];

export default function HelplinesScreen() {
  const handlePress = (item: Helpline) => {
    const clean = item.number.replace(/\s/g, '');

    if (item.type === 'call') {
      Alert.alert(
        `📞 Call ${item.name}?`,
        `Number: ${item.number}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Call ${item.number}`, onPress: () => Linking.openURL(`tel:${clean}`) },
        ]
      );
    } else if (item.type === 'whatsapp') {
      Linking.openURL(`whatsapp://send?phone=${clean}`).catch(() =>
        Alert.alert('WhatsApp not installed', 'Please install WhatsApp to use this feature.')
      );
    } else if (item.type === 'sms') {
      Linking.openURL(`sms:${clean}`);
    } else if (item.type === 'web') {
      if (item.number.includes('tnpdial100')) {
        const baseUrl = item.icon === '📘'
          ? 'https://www.facebook.com/tnpdial100'
          : 'https://twitter.com/tnpdial100';
        Linking.openURL(baseUrl);
      }
    }
  };

  const renderItem = ({ item }: { item: Helpline }) => (
    <TouchableOpacity style={S.card} onPress={() => handlePress(item)} activeOpacity={0.75}>
      <Text style={S.cardIcon}>{item.icon}</Text>
      <View style={S.cardBody}>
        <Text style={S.cardName}>{item.name}</Text>
        {item.desc ? <Text style={S.cardDesc}>{item.desc}</Text> : null}
      </View>
      <View style={S.callChip}>
        <Text style={S.callChipTxt}>{item.number}</Text>
        <Text style={S.callChipAction}>
          {item.type === 'call'      ? '📞 Tap to Call'
          : item.type === 'whatsapp' ? '💬 WhatsApp'
          : item.type === 'sms'      ? '📩 SMS'
          :                            '🌐 Open'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={S.container}>
      <SectionList
        sections={HELPLINES}
        keyExtractor={i => i.id}
        contentContainerStyle={S.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={S.sectionHeader}>{section.title}</Text>
        )}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={S.topBanner}>
            <Text style={S.bannerTxt}>
              Tap any number to call instantly.{'\n'}
              All connections go directly to the service.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const S = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.background },
  list:          { paddingBottom: 32 },
  topBanner:     { backgroundColor: Colors.shieldPurpleLight, margin: 12, borderRadius: 12, padding: 12 },
  bannerTxt:     { color: Colors.shieldPurpleDark, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  sectionHeader: { fontSize: 13, fontWeight: 'bold', color: Colors.textSecondary, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6, letterSpacing: 0.5 },
  card:          { backgroundColor: Colors.white, marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', elevation: 1, borderWidth: 1, borderColor: Colors.border },
  cardIcon:      { fontSize: 26, marginRight: 10 },
  cardBody:      { flex: 1 },
  cardName:      { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  cardDesc:      { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  callChip:      { alignItems: 'flex-end' },
  callChipTxt:   { fontSize: 13, fontWeight: 'bold', color: '#8B0000' },
  callChipAction:{ fontSize: 10, color: Colors.shieldPurple, marginTop: 2 },
});
