import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from '@tailwindcss/vite';

// Set CAPACITOR=true when building for mobile to use relative asset paths
const isCapacitor = process.env.CAPACITOR === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  base: isCapacitor ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      '/api': 'http://backend:3001',
      '/socket.io': {
        target: 'http://backend:3001',
        ws: true,
      },
    },
  },
});
