/**
 * Beep corto de aviso (cocinas KDS y similares) con un único AudioContext.
 * Antes cada beep creaba un AudioContext nuevo: el navegador limita ~6 vivos,
 * así que tras varios avisos la cocina se quedaba muda hasta recargar.
 * Mismo tono que siempre: 880 Hz · 0,15 s.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Desbloquea el audio tras un gesto del usuario (política del navegador). */
export function unlockUiAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
}

function scheduleBeep(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.type = 'sine';
  gain.gain.value = 0.3;
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

export function playUiBeep(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Con el audio bloqueado, reanudar primero: programar en suspendido no suena.
  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => scheduleBeep(ctx))
      .catch(() => undefined);
    return;
  }
  scheduleBeep(ctx);
}
