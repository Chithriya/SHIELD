import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Linking, ActivityIndicator,
  FlatList, Platform, SectionList,
} from 'react-native';
import * as Location from 'expo-location';
import { Colors } from '../constants/colors';

// ─────────────────────────────────────────────────────────────────────────────
// ALL-INDIA Offline Database (state police HQs + major city stations)
// Used immediately so the screen is never empty, even with no internet
// ─────────────────────────────────────────────────────────────────────────────
const INDIA_STATIONS = [
  // ── Andhra Pradesh ───────────────────────────────────────────────────────
  { id:'ap1',  name:'Renigunta Police Station',          lat:13.6530, lng:79.5150, address:'Renigunta, Tirupati Dist, AP' },
  { id:'ap2',  name:'Tirupati Town Police Station',       lat:13.6288, lng:79.4192, address:'Tirupati, Andhra Pradesh' },
  { id:'ap3',  name:'Chandragiri Police Station',         lat:13.5850, lng:79.3167, address:'Chandragiri, AP' },
  { id:'ap4',  name:'Srikalahasti Police Station',        lat:13.7500, lng:79.6980, address:'Srikalahasti, AP' },
  { id:'ap5',  name:'Vijayawada One Town PS',             lat:16.5062, lng:80.6480, address:'Vijayawada, AP' },
  { id:'ap6',  name:'Guntur Town Police Station',         lat:16.3067, lng:80.4365, address:'Guntur, AP' },
  { id:'ap7',  name:'Visakhapatnam Town PS',              lat:17.6868, lng:83.2185, address:'Visakhapatnam, AP' },
  { id:'ap8',  name:'Kurnool Town Police Station',        lat:15.8281, lng:78.0373, address:'Kurnool, AP' },
  { id:'ap9',  name:'Nellore Town Police Station',        lat:14.4426, lng:79.9865, address:'Nellore, AP' },
  { id:'ap10', name:'Ongole Town Police Station',         lat:15.5057, lng:80.0499, address:'Ongole, AP' },
  { id:'ap11', name:'Kadapa Town Police Station',         lat:14.4673, lng:78.8242, address:'Kadapa, AP' },
  { id:'ap12', name:'Anantapur Town Police Station',      lat:14.6819, lng:77.6006, address:'Anantapur, AP' },
  { id:'ap13', name:'Chittoor Town Police Station',       lat:13.2172, lng:79.1003, address:'Chittoor, AP' },
  { id:'ap14', name:'Nandyal Police Station',             lat:15.4786, lng:78.4837, address:'Nandyal, AP' },
  { id:'ap15', name:'Eluru Town Police Station',          lat:16.7107, lng:81.0952, address:'Eluru, AP' },
  { id:'ap16', name:'Rajam Police Station',               lat:18.4670, lng:83.6290, address:'Rajam, AP' },
  { id:'ap17', name:'Kakinada Town Police Station',       lat:16.9891, lng:82.2475, address:'Kakinada, AP' },
  { id:'ap18', name:'Rajahmundry Town PS',                lat:17.0005, lng:81.8040, address:'Rajahmundry, AP' },
  // ── Telangana ────────────────────────────────────────────────────────────
  { id:'ts1',  name:'Hyderabad Commissionerate',          lat:17.3850, lng:78.4867, address:'Hyderabad, Telangana' },
  { id:'ts2',  name:'Secunderabad Police Station',        lat:17.4399, lng:78.4983, address:'Secunderabad, Telangana' },
  { id:'ts3',  name:'Warangal Town Police Station',       lat:17.9784, lng:79.5941, address:'Warangal, Telangana' },
  { id:'ts4',  name:'Karimnagar Town PS',                 lat:18.4386, lng:79.1288, address:'Karimnagar, Telangana' },
  { id:'ts5',  name:'Nizamabad Town PS',                  lat:18.6725, lng:78.0941, address:'Nizamabad, Telangana' },
  { id:'ts6',  name:'Khammam Town PS',                    lat:17.2473, lng:80.1514, address:'Khammam, Telangana' },
  { id:'ts7',  name:'Nalgonda Town PS',                   lat:17.0575, lng:79.2671, address:'Nalgonda, Telangana' },
  { id:'ts8',  name:'Adilabad Town PS',                   lat:19.6640, lng:78.5320, address:'Adilabad, Telangana' },
  // ── Tamil Nadu ───────────────────────────────────────────────────────────
  { id:'tn1',  name:'Chennai Commissionerate',            lat:13.0827, lng:80.2707, address:'Chennai, Tamil Nadu' },
  { id:'tn2',  name:'Coimbatore City PS',                 lat:11.0168, lng:76.9558, address:'Coimbatore, TN' },
  { id:'tn3',  name:'Madurai Town PS',                    lat:9.9252,  lng:78.1198, address:'Madurai, TN' },
  { id:'tn4',  name:'Trichy Town PS',                     lat:10.7905, lng:78.7047, address:'Trichy, TN' },
  { id:'tn5',  name:'Salem Town PS',                      lat:11.6643, lng:78.1460, address:'Salem, TN' },
  { id:'tn6',  name:'Tiruppur Town PS',                   lat:11.1085, lng:77.3411, address:'Tiruppur, TN' },
  { id:'tn7',  name:'Erode Town PS',                      lat:11.3410, lng:77.7172, address:'Erode, TN' },
  { id:'tn8',  name:'Vellore Town PS',                    lat:12.9165, lng:79.1325, address:'Vellore, TN' },
  { id:'tn9',  name:'Tirunelveli Town PS',                lat:8.7139,  lng:77.7567, address:'Tirunelveli, TN' },
  { id:'tn10', name:'Thanjavur Town PS',                  lat:10.7870, lng:79.1378, address:'Thanjavur, TN' },
  { id:'tn11', name:'Dindigul Town PS',                   lat:10.3624, lng:77.9695, address:'Dindigul, TN' },
  { id:'tn12', name:'Cuddalore Town PS',                  lat:11.7480, lng:79.7714, address:'Cuddalore, TN' },
  { id:'tn13', name:'Kanchipuram PS',                     lat:12.8342, lng:79.7036, address:'Kanchipuram, TN' },
  { id:'tn14', name:'Hosur PS',                           lat:12.7409, lng:77.8253, address:'Hosur, TN' },
  { id:'tn15', name:'Ambur PS',                           lat:12.7919, lng:78.7174, address:'Ambur, TN' },
  // ── Karnataka ────────────────────────────────────────────────────────────
  { id:'ka1',  name:'Bengaluru Commissionerate',          lat:12.9716, lng:77.5946, address:'Bengaluru, Karnataka' },
  { id:'ka2',  name:'Mysuru City PS',                     lat:12.2958, lng:76.6394, address:'Mysuru, Karnataka' },
  { id:'ka3',  name:'Hubballi City PS',                   lat:15.3647, lng:75.1240, address:'Hubballi, Karnataka' },
  { id:'ka4',  name:'Mangaluru City PS',                  lat:12.9141, lng:74.8560, address:'Mangaluru, Karnataka' },
  { id:'ka5',  name:'Belagavi City PS',                   lat:15.8497, lng:74.4977, address:'Belagavi, Karnataka' },
  { id:'ka6',  name:'Kalaburagi City PS',                 lat:17.3297, lng:76.8343, address:'Kalaburagi, Karnataka' },
  { id:'ka7',  name:'Ballari City PS',                    lat:15.1394, lng:76.9214, address:'Ballari, Karnataka' },
  { id:'ka8',  name:'Shivamogga City PS',                 lat:13.9299, lng:75.5681, address:'Shivamogga, Karnataka' },
  // ── Kerala ───────────────────────────────────────────────────────────────
  { id:'kl1',  name:'Thiruvananthapuram City PS',         lat:8.5241,  lng:76.9366, address:'Thiruvananthapuram, Kerala' },
  { id:'kl2',  name:'Kochi City PS',                      lat:9.9312,  lng:76.2673, address:'Kochi, Kerala' },
  { id:'kl3',  name:'Kozhikode City PS',                  lat:11.2588, lng:75.7804, address:'Kozhikode, Kerala' },
  { id:'kl4',  name:'Thrissur City PS',                   lat:10.5276, lng:76.2144, address:'Thrissur, Kerala' },
  { id:'kl5',  name:'Kollam City PS',                     lat:8.8932,  lng:76.6141, address:'Kollam, Kerala' },
  { id:'kl6',  name:'Malappuram PS',                      lat:11.0510, lng:76.0711, address:'Malappuram, Kerala' },
  { id:'kl7',  name:'Palakkad PS',                        lat:10.7867, lng:76.6548, address:'Palakkad, Kerala' },
  // ── Maharashtra ──────────────────────────────────────────────────────────
  { id:'mh1',  name:'Mumbai Commissionerate',             lat:18.9388, lng:72.8354, address:'Mumbai, Maharashtra' },
  { id:'mh2',  name:'Pune Commissionerate',               lat:18.5204, lng:73.8567, address:'Pune, Maharashtra' },
  { id:'mh3',  name:'Nagpur City PS',                     lat:21.1458, lng:79.0882, address:'Nagpur, Maharashtra' },
  { id:'mh4',  name:'Nashik City PS',                     lat:20.0059, lng:73.7910, address:'Nashik, Maharashtra' },
  { id:'mh5',  name:'Aurangabad City PS',                 lat:19.8762, lng:75.3433, address:'Aurangabad, Maharashtra' },
  { id:'mh6',  name:'Thane City PS',                      lat:19.2183, lng:72.9781, address:'Thane, Maharashtra' },
  { id:'mh7',  name:'Solapur City PS',                    lat:17.6805, lng:75.9064, address:'Solapur, Maharashtra' },
  { id:'mh8',  name:'Kolhapur City PS',                   lat:16.7050, lng:74.2433, address:'Kolhapur, Maharashtra' },
  // ── Delhi ────────────────────────────────────────────────────────────────
  { id:'dl1',  name:'Delhi Police Headquarters',          lat:28.6139, lng:77.2090, address:'New Delhi' },
  { id:'dl2',  name:'Connaught Place PS',                 lat:28.6315, lng:77.2167, address:'Connaught Place, Delhi' },
  { id:'dl3',  name:'South Delhi PS',                     lat:28.5355, lng:77.2100, address:'South Delhi' },
  { id:'dl4',  name:'North Delhi PS',                     lat:28.7041, lng:77.1025, address:'North Delhi' },
  { id:'dl5',  name:'East Delhi PS',                      lat:28.6279, lng:77.2950, address:'East Delhi' },
  { id:'dl6',  name:'West Delhi PS',                      lat:28.6562, lng:77.0900, address:'West Delhi' },
  // ── West Bengal ──────────────────────────────────────────────────────────
  { id:'wb1',  name:'Kolkata Commissionerate',            lat:22.5726, lng:88.3639, address:'Kolkata, West Bengal' },
  { id:'wb2',  name:'Howrah City PS',                     lat:22.5958, lng:88.2636, address:'Howrah, West Bengal' },
  { id:'wb3',  name:'Asansol Durgapur PS',                lat:23.6850, lng:86.9620, address:'Asansol, WB' },
  { id:'wb4',  name:'Siliguri City PS',                   lat:26.7271, lng:88.3953, address:'Siliguri, WB' },
  // ── Gujarat ──────────────────────────────────────────────────────────────
  { id:'gj1',  name:'Ahmedabad Commissionerate',          lat:23.0225, lng:72.5714, address:'Ahmedabad, Gujarat' },
  { id:'gj2',  name:'Surat City PS',                      lat:21.1702, lng:72.8311, address:'Surat, Gujarat' },
  { id:'gj3',  name:'Vadodara City PS',                   lat:22.3072, lng:73.1812, address:'Vadodara, Gujarat' },
  { id:'gj4',  name:'Rajkot City PS',                     lat:22.3039, lng:70.8022, address:'Rajkot, Gujarat' },
  { id:'gj5',  name:'Bhavnagar City PS',                  lat:21.7645, lng:72.1519, address:'Bhavnagar, Gujarat' },
  // ── Rajasthan ────────────────────────────────────────────────────────────
  { id:'rj1',  name:'Jaipur Commissionerate',             lat:26.9124, lng:75.7873, address:'Jaipur, Rajasthan' },
  { id:'rj2',  name:'Jodhpur City PS',                    lat:26.2389, lng:73.0243, address:'Jodhpur, Rajasthan' },
  { id:'rj3',  name:'Kota City PS',                       lat:25.2138, lng:75.8648, address:'Kota, Rajasthan' },
  { id:'rj4',  name:'Udaipur City PS',                    lat:24.5854, lng:73.7125, address:'Udaipur, Rajasthan' },
  { id:'rj5',  name:'Ajmer City PS',                      lat:26.4499, lng:74.6399, address:'Ajmer, Rajasthan' },
  // ── Uttar Pradesh ────────────────────────────────────────────────────────
  { id:'up1',  name:'Lucknow Commissionerate',            lat:26.8467, lng:80.9462, address:'Lucknow, UP' },
  { id:'up2',  name:'Kanpur Commissionerate',             lat:26.4499, lng:80.3319, address:'Kanpur, UP' },
  { id:'up3',  name:'Agra City PS',                       lat:27.1767, lng:78.0081, address:'Agra, UP' },
  { id:'up4',  name:'Varanasi City PS',                   lat:25.3176, lng:82.9739, address:'Varanasi, UP' },
  { id:'up5',  name:'Allahabad City PS',                  lat:25.4358, lng:81.8463, address:'Prayagraj, UP' },
  { id:'up6',  name:'Meerut City PS',                     lat:28.9845, lng:77.7064, address:'Meerut, UP' },
  { id:'up7',  name:'Ghaziabad City PS',                  lat:28.6692, lng:77.4538, address:'Ghaziabad, UP' },
  { id:'up8',  name:'Noida City PS',                      lat:28.5355, lng:77.3910, address:'Noida, UP' },
  // ── Madhya Pradesh ───────────────────────────────────────────────────────
  { id:'mp1',  name:'Bhopal Commissionerate',             lat:23.2599, lng:77.4126, address:'Bhopal, MP' },
  { id:'mp2',  name:'Indore City PS',                     lat:22.7196, lng:75.8577, address:'Indore, MP' },
  { id:'mp3',  name:'Gwalior City PS',                    lat:26.2183, lng:78.1828, address:'Gwalior, MP' },
  { id:'mp4',  name:'Jabalpur City PS',                   lat:23.1815, lng:79.9864, address:'Jabalpur, MP' },
  // ── Bihar ────────────────────────────────────────────────────────────────
  { id:'br1',  name:'Patna Commissionerate',              lat:25.5941, lng:85.1376, address:'Patna, Bihar' },
  { id:'br2',  name:'Gaya City PS',                       lat:24.7914, lng:85.0002, address:'Gaya, Bihar' },
  { id:'br3',  name:'Muzaffarpur City PS',                lat:26.1209, lng:85.3647, address:'Muzaffarpur, Bihar' },
  { id:'br4',  name:'Bhagalpur City PS',                  lat:25.2425, lng:86.9842, address:'Bhagalpur, Bihar' },
  // ── Odisha ───────────────────────────────────────────────────────────────
  { id:'od1',  name:'Bhubaneswar Commissionerate',        lat:20.2961, lng:85.8245, address:'Bhubaneswar, Odisha' },
  { id:'od2',  name:'Cuttack City PS',                    lat:20.4625, lng:85.8830, address:'Cuttack, Odisha' },
  { id:'od3',  name:'Rourkela City PS',                   lat:22.2604, lng:84.8536, address:'Rourkela, Odisha' },
  // ── Punjab ───────────────────────────────────────────────────────────────
  { id:'pb1',  name:'Ludhiana Commissionerate',           lat:30.9010, lng:75.8573, address:'Ludhiana, Punjab' },
  { id:'pb2',  name:'Amritsar City PS',                   lat:31.6340, lng:74.8723, address:'Amritsar, Punjab' },
  { id:'pb3',  name:'Jalandhar City PS',                  lat:31.3260, lng:75.5762, address:'Jalandhar, Punjab' },
  // ── Haryana ──────────────────────────────────────────────────────────────
  { id:'hr1',  name:'Faridabad City PS',                  lat:28.4089, lng:77.3178, address:'Faridabad, Haryana' },
  { id:'hr2',  name:'Gurugram City PS',                   lat:28.4595, lng:77.0266, address:'Gurugram, Haryana' },
  { id:'hr3',  name:'Ambala City PS',                     lat:30.3752, lng:76.7821, address:'Ambala, Haryana' },
  // ── Jharkhand ────────────────────────────────────────────────────────────
  { id:'jh1',  name:'Ranchi City PS',                     lat:23.3441, lng:85.3096, address:'Ranchi, Jharkhand' },
  { id:'jh2',  name:'Jamshedpur City PS',                 lat:22.8046, lng:86.2029, address:'Jamshedpur, Jharkhand' },
  { id:'jh3',  name:'Dhanbad City PS',                    lat:23.7957, lng:86.4304, address:'Dhanbad, Jharkhand' },
  // ── Chhattisgarh ─────────────────────────────────────────────────────────
  { id:'cg1',  name:'Raipur City PS',                     lat:21.2514, lng:81.6296, address:'Raipur, Chhattisgarh' },
  { id:'cg2',  name:'Bhilai City PS',                     lat:21.1938, lng:81.3509, address:'Bhilai, CG' },
  // ── Assam ────────────────────────────────────────────────────────────────
  { id:'as1',  name:'Guwahati Commissionerate',           lat:26.1445, lng:91.7362, address:'Guwahati, Assam' },
  { id:'as2',  name:'Dibrugarh City PS',                  lat:27.4728, lng:94.9120, address:'Dibrugarh, Assam' },
  // ── Himachal Pradesh ─────────────────────────────────────────────────────
  { id:'hp1',  name:'Shimla City PS',                     lat:31.1048, lng:77.1734, address:'Shimla, Himachal Pradesh' },
  { id:'hp2',  name:'Dharamsala PS',                      lat:32.2190, lng:76.3234, address:'Dharamsala, HP' },
  // ── Uttarakhand ──────────────────────────────────────────────────────────
  { id:'uk1',  name:'Dehradun City PS',                   lat:30.3165, lng:78.0322, address:'Dehradun, Uttarakhand' },
  { id:'uk2',  name:'Haridwar City PS',                   lat:29.9457, lng:78.1642, address:'Haridwar, Uttarakhand' },
  // ── Goa ─────────────────────────────────────────────────────────────────
  { id:'ga1',  name:'Panaji City PS',                     lat:15.4909, lng:73.8278, address:'Panaji, Goa' },
  { id:'ga2',  name:'Margao PS',                          lat:15.2993, lng:73.9862, address:'Margao, Goa' },
  // ── Jammu & Kashmir ──────────────────────────────────────────────────────
  { id:'jk1',  name:'Srinagar City PS',                   lat:34.0837, lng:74.7973, address:'Srinagar, J&K' },
  { id:'jk2',  name:'Jammu City PS',                      lat:32.7266, lng:74.8570, address:'Jammu, J&K' },
  // ── North East ───────────────────────────────────────────────────────────
  { id:'mn1',  name:'Imphal City PS',                     lat:24.8170, lng:93.9368, address:'Imphal, Manipur' },
  { id:'mg1',  name:'Shillong City PS',                   lat:25.5788, lng:91.8933, address:'Shillong, Meghalaya' },
  { id:'ag1',  name:'Agartala City PS',                   lat:23.8315, lng:91.2868, address:'Agartala, Tripura' },
  { id:'nag1', name:'Kohima City PS',                     lat:25.6747, lng:94.1086, address:'Kohima, Nagaland' },
  { id:'miz1', name:'Aizawl City PS',                     lat:23.7271, lng:92.7176, address:'Aizawl, Mizoram' },
  { id:'sk1',  name:'Gangtok City PS',                    lat:27.3389, lng:88.6065, address:'Gangtok, Sikkim' },
  // ── Puducherry ───────────────────────────────────────────────────────────
  { id:'py1',  name:'Puducherry City PS',                 lat:11.9416, lng:79.8083, address:'Puducherry' },
  // ── Chandigarh ───────────────────────────────────────────────────────────
  { id:'ch1',  name:'Chandigarh City PS',                 lat:30.7333, lng:76.7794, address:'Chandigarh' },
];

// State police control room numbers (for the helpline tab)
const STATE_POLICE: { state: string; number: string; }[] = [
  { state: 'National Emergency',     number: '112' },
  { state: 'Police (National)',       number: '100' },
  { state: 'Andhra Pradesh',         number: '0866-2410444' },
  { state: 'Telangana',              number: '040-27852425' },
  { state: 'Tamil Nadu',             number: '044-28447777' },
  { state: 'Karnataka',              number: '080-22943322' },
  { state: 'Kerala',                 number: '0471-2721547' },
  { state: 'Maharashtra',            number: '022-22620111' },
  { state: 'Delhi',                  number: '011-23490000' },
  { state: 'West Bengal',            number: '033-22143004' },
  { state: 'Gujarat',                number: '079-23250201' },
  { state: 'Rajasthan',              number: '0141-2744000' },
  { state: 'Uttar Pradesh',          number: '0522-2610100' },
  { state: 'Madhya Pradesh',         number: '0755-2443500' },
  { state: 'Bihar',                  number: '0612-2201332' },
  { state: 'Odisha',                 number: '0674-2392455' },
  { state: 'Punjab',                 number: '0172-2740070' },
  { state: 'Haryana',                number: '0172-2740070' },
  { state: 'Jharkhand',              number: '0651-2480200' },
  { state: 'Chhattisgarh',           number: '0771-4014000' },
  { state: 'Assam',                  number: '0361-2237939' },
  { state: 'Himachal Pradesh',       number: '0177-2621131' },
  { state: 'Uttarakhand',            number: '0135-2710954' },
  { state: 'Goa',                    number: '0832-2423400' },
  { state: 'Jammu & Kashmir',        number: '0194-2452222' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Station {
  id: string; name: string; lat: number; lng: number;
  address: string; distance: number; isLive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function haversine(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, D = Math.PI / 180;
  const dLa = (la2 - la1) * D, dLo = (lo2 - lo1) * D;
  const a = Math.sin(dLa/2)**2 +
    Math.cos(la1*D) * Math.cos(la2*D) * Math.sin(dLo/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function nearestOffline(lat: number, lng: number): Station[] {
  return INDIA_STATIONS
    .map(s => ({ ...s, distance: haversine(lat, lng, s.lat, s.lng), isLive: false }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

async function tryFetchLive(lat: number, lng: number, signal: AbortSignal): Promise<Station[]> {
  const q = `[out:json][timeout:20];(node["amenity"="police"](around:8000,${lat},${lng});way["amenity"="police"](around:8000,${lat},${lng}););out center 25;`;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(`${mirror}?data=${encodeURIComponent(q)}`, {
        signal,
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const els: any[] = json.elements ?? [];
      if (els.length === 0) continue;
      return els.map((el, i) => {
        const eLat = el.lat ?? el.center?.lat ?? lat;
        const eLng = el.lon ?? el.center?.lon ?? lng;
        return {
          id:       'live_' + (el.id ?? i),
          name:     el.tags?.name || el.tags?.['name:en'] ||
                    el.tags?.['name:te'] || el.tags?.['name:hi'] ||
                    el.tags?.['name:ta'] || 'Police Station',
          lat:      eLat, lng: eLng,
          address:  el.tags?.['addr:full'] || el.tags?.['addr:street'] ||
                    el.tags?.['addr:city'] || '',
          distance: haversine(lat, lng, eLat, eLng),
          isLive:   true,
        };
      }).sort((a, b) => a.distance - b.distance);
    } catch (e: any) {
      if (e?.name === 'AbortError') return [];
    }
  }
  return [];
}
function formatDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km away` : `${m} m away`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function PoliceLocatorScreen() {
  const [tab,         setTab]         = useState<'nearby' | 'helplines'>('nearby');
  const [stations,    setStations]    = useState<Station[]>([]);
  const [gpsLoading,  setGpsLoading]  = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [isLive,      setIsLive]      = useState(false);
  const [showInfo,    setShowInfo]    = useState(true);
  const [userLat,     setUserLat]     = useState(0);
  const [userLng,     setUserLng]     = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    init();
    return () => abortRef.current?.abort();
  }, []);

  const init = async () => {
    setGpsLoading(true);
    // Default: centre of India
    let lat = 20.5937, lng = 78.9629;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {}
    setUserLat(lat);
    setUserLng(lng);
    // ✅ Show offline data IMMEDIATELY — screen is never empty
    setStations(nearestOffline(lat, lng));
    setIsLive(false);
    setGpsLoading(false);

    // Then try to upgrade with live OpenStreetMap data
    fetchLive(lat, lng);
  };
  const fetchLive = async (lat: number, lng: number) => {
    setLiveLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const live = await tryFetchLive(lat, lng, abortRef.current.signal);
      if (live.length > 0) {
        setStations(live);
        setIsLive(true);
      }
    } catch {}
    setLiveLoading(false);
  };

  const refresh = () => {
    const lat = userLat || 20.5937;
    const lng = userLng || 78.9629;
    setStations(nearestOffline(lat, lng));
    setIsLive(false);
    fetchLive(lat, lng);
  };
  const openRoute = (s: Station) => {
    const label = encodeURIComponent(s.name);
    Linking.openURL(
      Platform.OS === 'android'
        ? `geo:${s.lat},${s.lng}?q=${s.lat},${s.lng}(${label})`
        : `maps:0,0?q=${label}@${s.lat},${s.lng}`
    ).catch(() =>
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
      )
    );
  };

  const openGoogleMaps = () => {
    const lat = userLat || 20.5937;
    const lng = userLng || 78.9629;
    Linking.openURL(
      `https://www.google.com/maps/search/police+station/@${lat},${lng},14z`
    );
  };

  // GPS loading
  if (gpsLoading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={Colors.shieldPurple} />
        <Text style={S.loadTxt}>Getting your location...</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>

      {/* ── Info Modal ───────────────────────────────────────────────────── */}
      <Modal visible={showInfo} transparent animationType="fade">
        <View style={S.overlay}>
          <View style={S.infoCard}>
            <Text style={S.infoTitle}>🚔 Police Station Locator</Text>
            <Text style={S.infoBody}>
              Shows police stations nearest to you across all of India.{'\n\n'}
              • Tap <Text style={{ fontWeight:'bold' }}>Route</Text> — opens Google Maps directions{'\n'}
              • Tap <Text style={{ fontWeight:'bold' }}>Call</Text> — dials Police 112 directly{'\n'}
              • Works offline with a built-in India-wide database{'\n'}
              • Live data loads automatically when internet is available
            </Text>
            <TouchableOpacity style={S.gotItBtn} onPress={() => setShowInfo(false)}>
              <Text style={S.gotItTxt}>OK, GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Call 112 ─────────────────────────────────────────────────────── */}
      <TouchableOpacity style={S.btn112} onPress={() => Linking.openURL('tel:112')}>
        <Text style={S.btn112Txt}>🚔  CALL POLICE 112</Text>
      </TouchableOpacity>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <View style={S.tabs}>
        <TouchableOpacity
          style={[S.tab, tab === 'nearby' && S.tabActive]}
          onPress={() => setTab('nearby')}>
          <Text style={[S.tabTxt, tab === 'nearby' && S.tabTxtActive]}>
            📍 Nearby Stations
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.tab, tab === 'helplines' && S.tabActive]}
          onPress={() => setTab('helplines')}>
          <Text style={[S.tabTxt, tab === 'helplines' && S.tabTxtActive]}>
            ☎️ State Police Numbers
          </Text>
        </TouchableOpacity>
      </View>

      {/* ══════════════ NEARBY TAB ══════════════════════════════════════════ */}
      {tab === 'nearby' && (
        <View style={{ flex: 1 }}>
          {/* Status + controls */}
          <View style={S.statusRow}>
            <View style={{ flex: 1 }}>
              {liveLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size="small" color={Colors.shieldPurple} />
                  <Text style={S.statusTxt}>Fetching live data...</Text>
                </View>
              ) : (
                <Text style={S.statusTxt}>
                  {isLive
                    ? `✅ ${stations.length} live stations near you`
                    : `📥 ${stations.length} stations (offline mode)`}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={refresh} disabled={liveLoading}>
              <Text style={[S.refreshTxt, liveLoading && { opacity: 0.4 }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {/* Google Maps search button */}
          <TouchableOpacity style={S.mapsBtn} onPress={openGoogleMaps}>
            <Text style={S.mapsBtnTxt}>🗺  Search Police Stations in Google Maps</Text>
          </TouchableOpacity>

          {/* Station list */}
          <FlatList
            data={stations}
            keyExtractor={s => s.id}
            contentContainerStyle={S.list}
            renderItem={({ item, index }) => (
              <View style={[S.card, index === 0 && S.cardFirst]}>
                <View style={S.cardLeft}>
                  <Text style={S.cardIcon}>🚔</Text>
                  {index === 0 && (
                    <View style={S.nearBadge}>
                      <Text style={S.nearBadgeTxt}>NEAREST</Text>
                    </View>
                  )}
                  {item.isLive && (
                    <View style={S.liveBadge}>
                      <Text style={S.liveBadgeTxt}>LIVE</Text>
                    </View>
                  )}
                </View>
                <View style={S.cardMid}>
                  <Text style={S.stName} numberOfLines={2}>{item.name}</Text>
                  {!!item.address && (
                    <Text style={S.stAddr} numberOfLines={1}>{item.address}</Text>
                  )}
                  <Text style={S.distTxt}>{formatDist(item.distance)}</Text>
                </View>
                <View style={S.cardBtns}>
                  <TouchableOpacity style={S.routeBtn} onPress={() => openRoute(item)}>
                    <Text style={S.routeTxt}>🗺 Route</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={S.callBtn}
                    onPress={() => Linking.openURL('tel:112')}>
                    <Text style={S.callTxt}>📞 Call</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* ══════════════ HELPLINES TAB ════════════════════════════════════════ */}
      {tab === 'helplines' && (
        <FlatList
          data={STATE_POLICE}
          keyExtractor={i => i.state}
          contentContainerStyle={S.list}
          ListHeaderComponent={
            <View style={S.helpBanner}>
              <Text style={S.helpBannerTxt}>
                Tap any number to call your state police control room directly.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                S.helpCard,
                item.state === 'National Emergency' && S.helpCardRed,
              ]}
              onPress={() => Linking.openURL(`tel:${item.number.replace(/[-\s]/g, '')}`)}>
              <View style={{ flex: 1 }}>
                <Text style={[
                  S.helpState,
                  item.state === 'National Emergency' && { color: Colors.white },
                ]}>
                  {item.state}
                </Text>
                <Text style={[
                  S.helpNum,
                  item.state === 'National Emergency' && { color: '#FFCDD2' },
                ]}>
                  {item.number}
                </Text>
              </View>
              <Text style={[
                S.callChip,
                item.state === 'National Emergency' && { color: Colors.white },
              ]}>
                📞 Tap to Call
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

    </View>
  );
}

const S = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadTxt:      { marginTop: 14, color: Colors.textSecondary, fontSize: 14 },

  // Info modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  infoCard:     { backgroundColor: Colors.white, borderRadius: 16, padding: 24, width: '100%' },
  infoTitle:    { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  infoBody:     { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  gotItBtn:     { marginTop: 20, backgroundColor: '#8B0000', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  gotItTxt:     { color: Colors.white, fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },

  // 112 button
  btn112:       { backgroundColor: '#8B0000', margin: 12, marginBottom: 8, borderRadius: 12, paddingVertical: 15, alignItems: 'center', elevation: 5 },
  btn112Txt:    { color: Colors.white, fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

  // Tabs
  tabs:         { flexDirection: 'row', marginHorizontal: 12, marginBottom: 6, backgroundColor: Colors.border, borderRadius: 10, padding: 3 },
  tab:          { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive:    { backgroundColor: Colors.white, elevation: 2 },
  tabTxt:       { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  tabTxtActive: { color: Colors.shieldPurple },

  // Nearby
  statusRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 4 },
  statusTxt:    { fontSize: 12, color: Colors.textSecondary },
  refreshTxt:   { fontSize: 12, color: Colors.shieldPurple, fontWeight: '700' },
  mapsBtn:      { backgroundColor: Colors.shieldPurpleLight, borderWidth: 1, borderColor: Colors.shieldPurple, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mapsBtnTxt:   { color: Colors.shieldPurple, fontWeight: '600', fontSize: 13 },
  list:         { padding: 12, paddingTop: 2, paddingBottom: 24 },
  card:         { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  cardFirst:    { borderColor: '#8B0000', borderWidth: 2 },
  cardLeft:     { alignItems: 'center', marginRight: 10 },
  cardIcon:     { fontSize: 28 },
  nearBadge:    { backgroundColor: '#8B0000', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2, marginTop: 4 },
  nearBadgeTxt: { color: Colors.white, fontSize: 7, fontWeight: 'bold' },
  liveBadge:    { backgroundColor: Colors.safeGreen, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2, marginTop: 3 },
  liveBadgeTxt: { color: Colors.white, fontSize: 7, fontWeight: 'bold' },
  cardMid:      { flex: 1, marginRight: 8 },
  stName:       { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
  stAddr:       { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  distTxt:      { fontSize: 12, color: '#8B0000', fontWeight: '700' },
  cardBtns:     { gap: 6 },
  routeBtn:     { backgroundColor: Colors.shieldPurple, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  routeTxt:     { color: Colors.white, fontSize: 11, fontWeight: '600' },
  callBtn:      { backgroundColor: '#8B0000', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  callTxt:      { color: Colors.white, fontSize: 11, fontWeight: '600' },

  // Helplines tab
  helpBanner:   { backgroundColor: Colors.shieldPurpleLight, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.shieldPurple },
  helpBannerTxt:{ fontSize: 13, color: Colors.shieldPurpleDark, textAlign: 'center' },
  helpCard:     { backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 1 },
  helpCardRed:  { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  helpState:    { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  helpNum:      { fontSize: 13, color: '#8B0000', fontWeight: 'bold', marginTop: 2 },
  callChip:     { fontSize: 11, color: Colors.shieldPurple, fontWeight: '600' },
});