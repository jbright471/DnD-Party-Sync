import { io } from 'socket.io-client';

// Connect via standard port using relative path, Vite handles /socket.io proxy
const socket = io({
    transports: ['websocket', 'polling'],
    autoConnect: true,
});

export default socket;
