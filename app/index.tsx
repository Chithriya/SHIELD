import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { storage } from '../src/services/StorageService';
import { Colors } from '../src/constants/colors';

export default function Index() {
  useEffect(() => {
    (async () => {
      // No artificial delay — navigate as soon as storage is checked
      const onboarded = await storage.isOnboarded();
      router.replace(onboarded ? '/main' : '/onboarding');
    })();
  }, []);

  return (
    <View style={S.container}>
      <Text style={S.logo}>SHIELD</Text>
      <Text style={S.tagline}>Smart Safety App</Text>
      <ActivityIndicator
        size="large"
        color={Colors.white}
        style={{ marginTop: 40 }}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.shieldPurple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 52,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#CECBF6',
    marginTop: 8,
    letterSpacing: 2,
  },
});
