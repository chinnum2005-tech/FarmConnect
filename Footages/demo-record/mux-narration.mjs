/**
 * Mux Playwright webm + timed TTS wav cues into one narrated MP4.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const metaPath = path.join(OUT_DIR, 'cues.json');

function whichFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (r.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg not found in PATH. Re-open terminal after install.');
}

function run(cmd, args) {
  console.log('>', cmd, args.slice(0, 6).join(' '), '...');
  execFileSync(cmd, args, { stdio: 'inherit' });
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const ffmpeg = whichFfmpeg();
const rawVideo = meta.rawVideo;
if (!rawVideo || !fs.existsSync(rawVideo)) {
  throw new Error(`Raw video missing: ${rawVideo}`);
}

const cues = meta.cues || [];
if (!cues.length) throw new Error('No narration cues found');

// Build delayed audio mix: each cue delayed by startMs
const inputs = ['-i', rawVideo];
cues.forEach((c) => {
  inputs.push('-i', c.wav);
});

const filterParts = [];
cues.forEach((c, i) => {
  const delay = Math.max(0, Math.round(c.startMs));
  // input index i+1 because 0 is video
  filterParts.push(`[${i + 1}:a]adelay=${delay}|${delay},volume=1.0[a${i}]`);
});
const mixInputs = cues.map((_, i) => `[a${i}]`).join('');
filterParts.push(
  `${mixInputs}amix=inputs=${cues.length}:dropout_transition=0:normalize=0[aout]`
);

const filter = filterParts.join(';');
const narratedWebm = path.join(OUT_DIR, `AgroTrace_Walkthrough_${meta.stamp}_temp.webm`);
const finalMp4 = path.join(OUT_DIR, `AgroTrace_Full_Walkthrough_${meta.stamp}.mp4`);
const desktopCopy = path.join(
  process.env.USERPROFILE || 'C:\\Users\\chinn',
  'Desktop',
  `AgroTrace_Full_Walkthrough_${meta.stamp}.mp4`
);

run(ffmpeg, [
  '-y',
  ...inputs,
  '-filter_complex',
  filter,
  '-map',
  '0:v',
  '-map',
  '[aout]',
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '23',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-shortest',
  finalMp4,
]);

try {
  fs.copyFileSync(finalMp4, desktopCopy);
} catch (e) {
  console.warn('Desktop copy skipped:', e.message);
}

console.log('\n✅ Final narrated video:');
console.log(finalMp4);
if (fs.existsSync(desktopCopy)) console.log('Desktop copy:', desktopCopy);
