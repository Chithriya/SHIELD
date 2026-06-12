// app/_layout.tsx
// FIXED: Added livetracking + nearbyservices routes

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../src/constants/colors';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: Colors.shieldPurple },
          headerTintColor:  Colors.white,
          headerTitleStyle: { fontWeight: 'bold' },
        }}>
        <Stack.Screen name="index"           options={{ headerShown: false }} />
        <Stack.Screen name="onboarding"      options={{ headerShown: false }} />
        <Stack.Screen name="main"            options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="alert"           options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="fakecall"        options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="contacts"        options={{ title: 'Emergency Contacts' }} />
        <Stack.Screen name="evidence"        options={{ title: 'Evidence Vault' }} />
        <Stack.Screen name="settings"        options={{ title: 'Settings' }} />
        <Stack.Screen name="policelocator"   options={{ title: 'Police Station Locator' }} />
        <Stack.Screen name="helplines"       options={{ title: 'Emergency Helplines' }} />
        {/* NEW ROUTES */}
        <Stack.Screen name="livetracking"    options={{ title: 'Live Tracking', headerStyle: { backgroundColor: '#1A1A2E' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="nearbyservices"  options={{ title: 'Nearby Services', headerStyle: { backgroundColor: '#1A1A2E' }, headerTintColor: '#fff' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
