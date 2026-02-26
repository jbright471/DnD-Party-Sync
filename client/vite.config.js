import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://backend:3001',
        ws: true,
      },
    },
  },
});
