'use client';

import { io, type Socket } from 'socket.io-client';

let singleton: Socket | null = null;

export function getSocket(): Socket {
  if (singleton) return singleton;
  singleton = io({
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
  });
  return singleton;
}

export function disposeSocket() {
  if (singleton) {
    singleton.disconnect();
    singleton = null;
  }
}
