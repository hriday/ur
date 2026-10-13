/** Synthesised clay-and-stone sounds; no audio files needed. */
let muted = $state(readMuted());
let ctx: AudioContext | null = null;

function readMuted() {
  try { return localStorage.getItem('ur.muted') === '1'; } catch { return false; }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, at: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.1, glide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Band-passed noise burst: the knock of clay or stone. */
function knock(at: number, freq: number, gain = 0.22, dur = 0.06) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sound = {
  get muted() {
    return muted;
  },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('ur.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  },
  dice() { for (let i = 0; i < 7; i++) knock(i * 0.07 + Math.random() * 0.04, 1800 + Math.random() * 900, 0.16); },
  step() { knock(0, 700, 0.2, 0.05); },
  capture() { tone(140, 0, 0.25, { type: 'triangle', gain: 0.22, glide: 0.5 }); knock(0.02, 2400, 0.22, 0.12); },
  rosette() { [880, 1318.5, 1760].forEach((f, i) => tone(f, i * 0.07, 0.9, { gain: 0.06 })); },
  bearOff() { tone(523.25, 0, 0.3, { gain: 0.07 }); tone(784, 0.1, 0.45, { gain: 0.07 }); },
  win() { [523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(f, i * 0.14, 1.1, { type: 'triangle', gain: 0.08 })); },
};
