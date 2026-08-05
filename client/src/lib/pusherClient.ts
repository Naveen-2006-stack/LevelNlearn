import PusherClient from 'pusher-js';

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || import.meta.env.NEXT_PUBLIC_PUSHER_APP_KEY || '';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || import.meta.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap2';

// If Pusher is not configured, create a no-op stub so the app doesn't crash.
const createNoOpPusher = (): PusherClient => {
  return {
    subscribe: () => ({
      bind: () => ({}),
      unbind: () => ({}),
      unbind_all: () => ({}),
      trigger: () => false,
    }),
    unsubscribe: () => ({}),
    bind: () => ({}),
    unbind: () => ({}),
    disconnect: () => ({}),
    connect: () => ({}),
    channel: () => null,
    allChannels: () => [],
    connection: { state: 'disconnected', bind: () => ({}), unbind: () => ({}) },
  } as unknown as PusherClient;
};

export const pusherClient: PusherClient = PUSHER_KEY
  ? new PusherClient(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
  : createNoOpPusher();
