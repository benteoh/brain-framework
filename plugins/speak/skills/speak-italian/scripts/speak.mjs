#!/usr/bin/env node
// speak.mjs — text → /tmp/opencode/tts/<hash>.wav via Piper (it_IT-riccardo-medium)
import { mkdirSync, existsSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(__dirname, '..');
const voicesDir = join(skillRoot, 'voices');
const voiceFile = join(voicesDir, 'it_IT-riccardo-x_low.onnx');
const piperCandidates = [
  join(process.env.HOME || '/tmp', '.local', 'bin', 'piper'),
  '/usr/bin/piper',
  '/usr/local/bin/piper',
  'piper',
];

function findPiper() {
  for (const c of piperCandidates) {
    if (c === 'piper') return 'piper';
    if (existsSync(c)) return c;
  }
  return 'piper';
}

function usage() {
  console.error('Usage: node speak.mjs "testo italiano" [--no-play] [--voice it_IT-riccardo-x_low] [--slow]');
  console.error('  --slow     1.3x length_scale for parola slow variant (policy: parola slow→normal)');
  console.error('  --no-play  suppress CLI playback (use for Studio where browser plays via /tts)');
  console.error('  default: plays via mpv/paplay on your PC (CLI mode); pass --no-play for Studio/browser-only');
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) { usage(); process.exit(1); }

let text = args[0];
let play = !args.includes('--no-play');
let slow = args.includes('--slow');
let voice = 'it_IT-riccardo-x_low';

// allow --voice override (v0 only riccardo)
const vi = args.indexOf('--voice');
if (vi !== -1 && args[vi + 1]) voice = args[vi + 1];

if (!text || text.trim().length === 0) { console.error('Error: text required (1..200 chars)'); process.exit(1); }
if (text.length > 200) { console.error(`Error: text too long (${text.length} > 200). Split it (policy: one sentence per clip).`); process.exit(1); }
if (voice !== 'it_IT-riccardo-x_low') {
  console.error(`Note: v0 is Italian-only, voice fixed to it_IT-riccardo-x_low. Requested "${voice}" ignored.`);
  voice = 'it_IT-riccardo-x_low';
}

const cacheDir = '/tmp/brain-tts';
mkdirSync(cacheDir, { recursive: true });

const lengthScale = slow ? '1.4' : '1.15';
const hash = createHash('sha256').update(`${voice}:${lengthScale}:${text}`).digest('hex').slice(0, 16);
const out = join(cacheDir, `${hash}.wav`);

if (existsSync(out) && statSync(out).size > 1024) {
  const j = JSON.stringify({ ok: true, wav: out, text, voice, cached: true, slow, lengthScale, url: `file://${out}`, ttsUrl: `/tts/${hash}.wav` });
  console.log(j);
  if (play) tryPlay(out);
  process.exit(0);
}

if (!existsSync(voiceFile)) {
  console.error(`Error: voice not found at ${voiceFile}`);
  console.error(`Run once: node .claude/skills/speak-italian/scripts/setup-piper.mjs`);
  process.exit(2);
}

const piper = findPiper();
try {
  const piperArgs = ['--model', voiceFile, '--output_file', out];
  if (slow) piperArgs.push('--length_scale', lengthScale);
  const r = spawnSync(piper, piperArgs, { input: text, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr?.toString() || `piper exit ${r.status}`);
    const r2 = spawnSync('bash', ['-c', `cat | "${piper}" --model "${voiceFile}" --output_file "${out}" ${slow ? `--length_scale ${lengthScale}` : ''}`], { input: text, encoding: 'utf8' });
    if (r2.status !== 0) {
      console.error(r2.stderr?.toString() || '');
      process.exit(2);
    }
  }
} catch (e) {
  console.error(`piper failed: ${e.message}`);
  process.exit(2);
}

if (!existsSync(out) || statSync(out).size < 1024) {
  console.error(`Error: wav not created or too small: ${out}`);
  process.exit(2);
}

console.log(JSON.stringify({ ok: true, wav: out, text, voice, cached: false, slow, lengthScale, url: `file://${out}`, ttsUrl: `/tts/${hash}.wav` }));
if (play) tryPlay(out);

function tryPlay(wav) {
  const players = [['mpv', ['--no-video', wav]], ['aplay', [wav]], ['ffplay', ['-nodisp', '-autoexit', wav]]];
  for (const [bin, a] of players) {
    const r = spawnSync(bin, a, { stdio: 'inherit' });
    if (r.status === 0) return;
    if (r.error && r.error.code === 'ENOENT') continue;
    // if player exists but fails, stop
    if (r.status !== null) return;
  }
  console.error('(no audio player found — install mpv or aplay; wav saved anyway)');
}
