import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@cadoot/shared';

// Same-origin connection. In dev, Vite proxies /socket.io to the server.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});
