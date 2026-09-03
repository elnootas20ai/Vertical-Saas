/**
 * Shared SSE connection — one EventSource per user/business/token.
 * Multiple useSSE hooks subscribe; connection closes when last unsubscribes.
 */
import { getApiBase } from '../lib/apiBase';
import { resolveSseAccessToken } from '../lib/sseToken';

export type SSEEventHandler = (data: unknown) => void;
export type SSEEventMap = Record<string, SSEEventHandler>;

const RECONNECT_INITIAL_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

type Subscriber = {
  id: number;
  handlersRef: { current: SSEEventMap };
};

type SharedState = {
  key: string;
  es: EventSource | null;
  subs: Map<number, Subscriber>;
  reconnectDelay: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  intentionalClose: boolean;
  listenedEvents: Set<string>;
};

const g = globalThis as typeof globalThis & { __vertial_sse_shared__?: SharedState };

function getState(): SharedState {
  if (!g.__vertial_sse_shared__) {
    g.__vertial_sse_shared__ = {
      key: '',
      es: null,
      subs: new Map(),
      reconnectDelay: RECONNECT_INITIAL_MS,
      reconnectTimeout: null,
      intentionalClose: false,
      listenedEvents: new Set(),
    };
  }
  return g.__vertial_sse_shared__;
}

function buildSseUrl(token: string | null, businessId?: string | null): string {
  const base = getApiBase();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (businessId) params.set('businessId', businessId);
  const qs = params.toString();
  return `${base}/api/sse${qs ? `?${qs}` : ''}`;
}

function emitAll(name: string, payload: unknown) {
  const st = getState();
  for (const sub of st.subs.values()) {
    const fn = sub.handlersRef.current[name];
    if (typeof fn === 'function') fn(payload);
  }
}

function ensureEventListener(eventName: string) {
  const st = getState();
  if (!st.es || st.listenedEvents.has(eventName)) return;
  if (eventName === 'connected' || eventName === 'disconnected' || eventName === 'reconnecting') {
    return;
  }
  st.listenedEvents.add(eventName);
  st.es.addEventListener(eventName, (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      emitAll(eventName, data);
    } catch {
      emitAll(eventName, e.data);
    }
  });
}

function wireNewHandlers() {
  const st = getState();
  for (const sub of st.subs.values()) {
    for (const name of Object.keys(sub.handlersRef.current)) {
      ensureEventListener(name);
    }
  }
}

let nextSubId = 1;

export type SseSubscribeArgs = {
  userId: string;
  token?: string | null;
  businessId?: string | null;
  handlersRef: { current: SSEEventMap };
};

export function subscribeSharedSse(args: SseSubscribeArgs): number {
  const st = getState();
  const id = nextSubId++;
  st.subs.set(id, { id, handlersRef: args.handlersRef });
  void ensureSharedConnection(args);
  wireNewHandlers();
  return id;
}

export function unsubscribeSharedSse(id: number) {
  const st = getState();
  st.subs.delete(id);
  if (st.subs.size === 0) {
    closeShared(true);
  }
}

function closeShared(intentional: boolean) {
  const st = getState();
  st.intentionalClose = intentional;
  if (st.reconnectTimeout) {
    clearTimeout(st.reconnectTimeout);
    st.reconnectTimeout = null;
  }
  if (st.es) {
    st.es.close();
    st.es = null;
  }
  st.listenedEvents.clear();
  st.key = '';
}

async function ensureSharedConnection(args: SseSubscribeArgs) {
  const st = getState();
  let activeToken = args.token || null;
  if (!activeToken) {
    activeToken = await resolveSseAccessToken();
  }
  if (!activeToken && getApiBase() !== '') {
    return;
  }

  const key = `${args.userId}|${args.businessId || ''}|${activeToken || ''}`;
  if (st.es && st.key === key) {
    wireNewHandlers();
    return;
  }

  closeShared(true);
  st.intentionalClose = false;
  st.key = key;
  st.reconnectDelay = RECONNECT_INITIAL_MS;

  const url = buildSseUrl(activeToken, args.businessId);
  const es = new EventSource(url, { withCredentials: true });
  st.es = es;

  const markConnected = (payload: unknown) => {
    st.reconnectDelay = RECONNECT_INITIAL_MS;
    emitAll('connected', payload);
  };

  es.onopen = () => {
    markConnected({ source: 'open', ts: Date.now() });
  };

  es.addEventListener('connected', (e: Event) => {
    const msg = e as MessageEvent;
    try {
      markConnected(JSON.parse(String(msg.data || '{}')));
    } catch {
      markConnected({ source: 'connected', raw: msg.data });
    }
  });

  wireNewHandlers();

  es.onerror = () => {
    if (st.intentionalClose) return;
    emitAll('reconnecting', { retryInMs: st.reconnectDelay });
    es.close();
    if (st.es === es) st.es = null;
    st.listenedEvents.clear();

    if (st.subs.size === 0) return;

    st.reconnectTimeout = setTimeout(() => {
      st.reconnectDelay = Math.min(st.reconnectDelay * 2, RECONNECT_MAX_MS);
      if (st.reconnectDelay >= 12_000) {
        emitAll('disconnected', { reason: 'error' });
      }
      // Reconnect with last known args from any subscriber
      const first = st.subs.values().next().value as Subscriber | undefined;
      if (!first) return;
      void ensureSharedConnection({
        userId: args.userId,
        token: args.token,
        businessId: args.businessId,
        handlersRef: first.handlersRef,
      });
    }, st.reconnectDelay);
  };
}

/** Call when tab becomes visible so late handlers attach to live ES. */
export function refreshSharedSseHandlers() {
  wireNewHandlers();
}
