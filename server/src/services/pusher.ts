import Pusher from 'pusher';

const PUSHER_APP_ID = process.env.PUSHER_APP_ID || '';
const PUSHER_KEY = process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_APP_KEY || '';
const PUSHER_SECRET = process.env.PUSHER_SECRET || '';
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '';

const isPusherConfigured =
  PUSHER_APP_ID.length > 0 &&
  PUSHER_KEY.length > 0 &&
  PUSHER_SECRET.length > 0 &&
  PUSHER_CLUSTER.length > 0;

const pusherServer = isPusherConfigured
  ? new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true,
    })
  : null;

let hasWarnedMissingConfig = false;
let hasWarnedDeliveryFailure = false;

export async function triggerEvent(channel: string, event: string, data: object): Promise<void> {
  if (!pusherServer) {
    if (!hasWarnedMissingConfig) {
      hasWarnedMissingConfig = true;
      console.warn('[pusher] Realtime disabled because PUSHER_* environment variables are not fully configured.');
    }
    return;
  }

  try {
    await pusherServer.trigger(channel, event, data);
  } catch (err) {
    if (!hasWarnedDeliveryFailure) {
      hasWarnedDeliveryFailure = true;
      console.warn('[pusher] Failed to deliver realtime event. Continuing without crashing server.', err);
    }
  }
}
