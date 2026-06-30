/** Canales externos que suenan al entrar un pedido nuevo en el tablero TPV. */
export const TPV_SOUND_CHANNELS = new Set(['web', 'glovo', 'justeat', 'ubereats']);

const STORAGE_KEY = 'tpv_board_sound';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Desbloquea audio tras gesto del usuario (política del navegador). */
export function unlockTpvBoardAudio() {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function isTpvBoardSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setTpvBoardSoundEnabled(on: boolean) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  }
}

type Tone = { freq: number; duration: number; gap?: number };

const CHANNEL_TONES: Record<string, Tone[]> = {
  web: [
    { freq: 660, duration: 0.1, gap: 0.04 },
    { freq: 880, duration: 0.16 },
  ],
  glovo: [
    { freq: 520, duration: 0.08, gap: 0.03 },
    { freq: 520, duration: 0.08, gap: 0.03 },
    { freq: 780, duration: 0.14 },
  ],
  justeat: [
    { freq: 740, duration: 0.11, gap: 0.04 },
    { freq: 590, duration: 0.15 },
  ],
  ubereats: [
    { freq: 420, duration: 0.14, gap: 0.05 },
    { freq: 630, duration: 0.18 },
  ],
};

export function playTpvChannelOrderSound(channel?: string | null) {
  const key = String(channel || '').trim().toLowerCase();
  if (!TPV_SOUND_CHANNELS.has(key)) return;

  const ctx = getAudioContext();
  const seq = CHANNEL_TONES[key];
  if (!ctx || !seq?.length) return;

  let t = ctx.currentTime;
  for (const note of seq) {
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
