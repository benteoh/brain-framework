#!/usr/bin/env node
// setup-piper.mjs — one-time idempotent setup for Piper + it_IT-riccardo-medium
import { mkdirSync, existsSync, createWriteStream, statSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(__dirname, '..');
const voicesDir = join(skillRoot, 'voices');
const binDir = join(process.env.HOME || '/tmp', '.local', 'bin');
const piperBin = join(binDir, 'piper');
const cacheDir = '/tmp/brain-tts';

const PIPER_VERSION = '2023.11.14-2';
const PIPER_URL = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz`;
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/it/it_IT/riccardo/x_low';
const VOICE_FILES = ['it_IT-riccardo-x_low.onnx', 'it_IT-riccardo-x_low.onnx.json'];

function log(m) { console.log(`[setup-piper] ${m}`); }
function ensureDir(d) { mkdirSync(d, { recursive: true }); }

async function download(url, dest) {
  log(`downloading ${url} → ${dest}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function setupPiperBinary() {
  if (existsSync(piperBin)) {
    log(`piper already at ${piperBin} — skipping`);
    return piperBin;
  }
  ensureDir(binDir);
  const workDir = '/tmp/brain-tts-work';
  ensureDir(workDir);
  const tgz = join(workDir, 'piper_linux_x86_64.tar.gz');
  await download(PIPER_URL, tgz);
  // extract — tar contains ./piper/piper
  try {
    execSync(`tar -xzf "${tgz}" -C "${workDir}"`, { stdio: 'inherit' });
    // find extracted piper dir (contains binary + libs + espeak-ng-data)
    const piperDir = join(workDir, 'piper');
    const realBin = join(piperDir, 'piper');
    if (!existsSync(realBin)) throw new Error('piper binary not found after extract');
    // install to ~/.local/share/piper and create wrapper in ~/.local/bin/piper
    const shareDir = join(process.env.HOME || '/tmp', '.local', 'share', 'piper');
    ensureDir(shareDir);
    execSync(`cp -a "${piperDir}"/* "${shareDir}"/`, { stdio: 'inherit' });
    const wrapper = `#!/bin/sh\nexport LD_LIBRARY_PATH="${shareDir}:$LD_LIBRARY_PATH"\nexport ESPEAK_DATA_PATH="${shareDir}/espeak-ng-data"\nexec "${shareDir}/piper" "$@"\n`;
    const { writeFileSync } = await import('fs');
    writeFileSync(piperBin, wrapper);
    execSync(`chmod +x "${piperBin}"`);
    log(`installed piper → ${piperBin} (wrapper → ${shareDir}/piper)`);
    execSync(`"${piperBin}" --help 2>&1 | head -n 5`, { stdio: 'inherit' });
  } catch (e) {
    log(`extract failed: ${e.message}`);
    log(`manual fallback: download ${PIPER_URL} and install binary to ${piperBin}`);
    throw e;
  }
  return piperBin;
}

async function setupVoice() {
  ensureDir(voicesDir);
  for (const f of VOICE_FILES) {
    const dest = join(voicesDir, f);
    if (existsSync(dest) && statSync(dest).size > 1024) {
      log(`voice ${f} already present — skipping`);
      continue;
    }
    await download(`${VOICE_BASE}/${f}`, dest);
    log(`saved ${dest} (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

async function verify(piper) {
  ensureDir(cacheDir);
  const voice = join(voicesDir, 'it_IT-riccardo-x_low.onnx');
  if (!existsSync(voice)) throw new Error(`voice missing: ${voice}`);
  const out = join(cacheDir, '_verify.wav');
  log(`verifying: echo "Ciao" | piper --model ${voice} → ${out}`);
  const r = spawnSync('bash', ['-c', `echo "Ciao" | "${piper}" --model "${voice}" --output_file "${out}"`], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`piper verify failed (exit ${r.status})`);
  }
  const sz = statSync(out).size;
  log(`verify ok — ${out} (${sz} bytes)`);
  if (sz < 1024) throw new Error('verify wav too small');
}

async function main() {
  log('starting — Italian-only, it_IT-riccardo-x_low, male');
  ensureDir(cacheDir);
  const piper = await setupPiperBinary();
  await setupVoice();
  await verify(piper);
  log('done. Try: node plugins/speak/skills/speak-italian/scripts/speak.mjs "Buongiorno!" --play');
}

main().catch(e => { console.error(`[setup-piper] failed: ${e.message}`); process.exit(1); });
