import type { CapacitorConfig } from '@capacitor/cli';

// Mobile configuration for Arcane Ally
// To build for Android/iOS:
//   1. Install Capacitor: npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
//   2. Set server URL: add VITE_SERVER_URL=http://<homelab-ip>:3002 to .env.local
//   3. Run: npm run cap:android  (or cap:ios)
//
// The app will load its web bundle from the device and connect to the homelab backend
// via the VITE_SERVER_URL environment variable baked in at build time.

const config: CapacitorConfig = {
  appId: 'com.arcaneally.dnd',
  appName: 'Arcane Ally',
  webDir: 'dist',
  plugins: {
    // Allow HTTP (cleartext) connections to the homelab on the local network
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: true, // Required for LAN HTTP connections
  },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
