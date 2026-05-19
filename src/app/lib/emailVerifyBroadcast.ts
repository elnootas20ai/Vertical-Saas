/** Sincroniza verificación de email entre pestañas del mismo navegador. */
const CHANNEL_NAME = 'vertial-email-verified';
const STORAGE_KEY = 'vertial_email_verified_signal';

export type EmailVerifiedSignal = { email: string; at: number };

export function broadcastEmailVerified(email: string) {
  const payload: EmailVerifiedSignal = { email: email.trim().toLowerCase(), at: Date.now() };
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch {
    /* Safari viejo / contextos restringidos */
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function subscribeEmailVerified(onVerified: (signal: EmailVerifiedSignal) => void) {
  const normalizedHandler = (raw: EmailVerifiedSignal) => {
    if (raw?.email) onVerified(raw);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<EmailVerifiedSignal>) => {
      normalizedHandler(event.data);
    };
  } catch {
    /* ignore */
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      normalizedHandler(JSON.parse(event.newValue) as EmailVerifiedSignal);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
