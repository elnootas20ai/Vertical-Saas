/**
 * Movimiento tienda en el TPV: apertura del panel embebido, sincronización en vivo
 * (SSE → evento de ventana) y sonido de traspaso entrante.
 * Mismo patrón que tpvStockReview.ts / tpvChannelSounds.ts.
 */

/** Abre el panel «Movimiento tienda» embebido en el shell TPV. */
export const TPV_OPEN_STORE_TRANSFERS_EVENT = 'vertial:tpv-open-store-transfers';

/** Un traspaso cambió (SSE): los paneles abiertos recargan. */
export const STORE_TRANSFER_SYNC_EVENT = 'vertial:store-transfer-sync';

export type StoreTransferLiveEvent = {
  id?: string;
  kind?: 'incoming' | 'received' | 'cancelled';
  status?: string;
  fromPdvId?: string;
  fromPdvName?: string;
  toPdvId?: string;
  toPdvName?: string;
  transitSeconds?: number;
  updatedAt?: string;
};

export function requestTpvStoreTransfersOpen(): void {
  window.dispatchEvent(new CustomEvent(TPV_OPEN_STORE_TRANSFERS_EVENT));
}

export function emitStoreTransferSync(payload: StoreTransferLiveEvent): void {
  window.dispatchEvent(new CustomEvent(STORE_TRANSFER_SYNC_EVENT, { detail: payload }));
}

// ─── Sonido (Web Audio, sin archivos) ────────────────────────────────────────

const SOUND_STORAGE_KEY = 'store_transfer_sound';

/** Sonido de traspaso entrante activado (por dispositivo, igual que tpv_board_sound). */
export function isStoreTransferSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
}

export function setStoreTransferSoundEnabled(on: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
  }
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Desbloquea el audio tras un gesto del usuario (política del navegador).
 * Llamar en un pointerdown del TPV, igual que unlockTpvBoardAudio de pedidos.
 */
export function unlockStoreTransferAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
}

function scheduleTransferTones(ctx: AudioContext): void {
  const notes: Array<{ freq: number; duration: number; gap?: number }> = [
    { freq: 523.25, duration: 0.11, gap: 0.04 }, // C5
    { freq: 659.25, duration: 0.11, gap: 0.04 }, // E5
    { freq: 783.99, duration: 0.2 }, // G5
  ];

  let t = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = note.freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.duration);
    osc.start(t);
    osc.stop(t + note.duration + 0.02);
    t += note.duration + (note.gap ?? 0.05);
  }
}

/** Arpegio ascendente distinto a pedidos/cocina: traspaso de otra tienda en camino. */
export function playStoreTransferSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Si el audio sigue bloqueado, programar las notas ahora las apila y suenan
  // todas de golpe al desbloquear: reanudar primero y programar después.
  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => scheduleTransferTones(ctx))
      .catch(() => undefined);
    return;
  }
  scheduleTransferTones(ctx);
}
