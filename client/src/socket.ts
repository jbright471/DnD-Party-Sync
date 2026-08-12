import { io, Socket } from 'socket.io-client';
import { consumeAccessCredential } from './lib/accessCredential';

// In dev/production Docker: VITE_SERVER_URL is unset → connects to same origin (Vite proxy / Nginx)
// In Capacitor mobile builds: set VITE_SERVER_URL=http://192.168.x.x:3001 in .env.local
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
export const accessCredential = consumeAccessCredential();

const socket: Socket = io(SERVER_URL, {
  // On mobile the connection is cross-origin; withCredentials not needed for this app
  transports: SERVER_URL ? ['websocket'] : ['websocket', 'polling'],
  auth: accessCredential.flow
    ? { accessFlow: accessCredential.flow, accessToken: accessCredential.token }
    : {},
});

socket.on('connect', () => {
  console.log('[Socket] Connected to server:', socket.id);
});

socket.on('disconnect', () => {
  console.log('[Socket] Disconnected');
});

export default socket;
