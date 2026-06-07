const fs = require('fs');
const path = require('path');

const sampleRate = 44100;

/** Classic bell: fundamental + harmonics with fast decay; optional second strike. */
function sampleBell(t, strikeOffset) {
  const local = t - strikeOffset;
  if (local < 0 || local > 0.9) return 0;
  const env = Math.exp(-6 * local) * (1 - Math.exp(-40 * local));
  const f0 = 880;
  const partials = [
    { ratio: 1, gain: 1 },
    { ratio: 2.4, gain: 0.45 },
    { ratio: 3.2, gain: 0.25 },
    { ratio: 4.5, gain: 0.12 }
  ];
  let s = 0;
  for (const p of partials) {
    s += p.gain * Math.sin(2 * Math.PI * f0 * p.ratio * local);
  }
  return s * env;
}

const duration = 1.6;
const numSamples = Math.floor(sampleRate * duration);
const data = Buffer.alloc(numSamples * 2);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let amp = sampleBell(t, 0) + 0.85 * sampleBell(t, 0.55);
  amp = Math.max(-1, Math.min(1, amp * 0.55));
  const sample = Math.max(-32767, Math.min(32767, Math.floor(amp * 32767)));
  data.writeInt16LE(sample, i * 2);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const wavPath = path.join(outDir, 'bell.wav');

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

fs.writeFileSync(wavPath, Buffer.concat([header, data]));
fs.copyFileSync(wavPath, path.join(outDir, 'bell.mp3'));
console.log('Created', wavPath);
