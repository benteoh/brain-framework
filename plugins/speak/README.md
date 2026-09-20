# Speak Plugin

Offline TTS for language learning. v0 is **Italian-only, male** via [Piper](https://github.com/rhasspy/piper) (`it_IT-riccardo-medium`).

## Plugin

- Name: `speak` (`plugins/speak`)
- Skill: `speak-italian` (`plugins/speak/skills/speak-italian`)
- Provides: `speak:italian`
- Data root: `Speak` (cache at `/tmp/opencode/tts`, models under `voices/`)

## Why

Fits `Learning/Italian` sessions: any Italian phrase can be spoken naturally without cloud/AI keys, keeping the 2-week MVP / <$200/mo constraints ($0).

## Setup

One-time (downloads ~63MB + piper binary):

```bash
node plugins/speak/skills/speak-italian/scripts/setup-piper.mjs
```

Then:

```bash
node plugins/speak/skills/speak-italian/scripts/speak.mjs "Ciao, mi chiamo Ben." --play
# prints {"ok":true,"wav":"/tmp/opencode/tts/<hash>.wav",...}
```

## Voices

`voices/` is gitignored (`*.onnx`). See `plugins/speak/skills/speak-italian/voices/README.md`.

Future voices (deferred): `it_IT-paola-medium` (female), English packs.
