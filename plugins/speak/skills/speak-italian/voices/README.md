# Voices — gitignored

Piper ONNX voices are large and not committed.

## v0 — Italian male (required)

- **Voice:** `it_IT-riccardo-medium`
- **Files:**
  - `it_IT-riccardo-medium.onnx` (~63MB)
  - `it_IT-riccardo-medium.onnx.json`
- **Source:** `https://huggingface.co/rhasspy/piper-voices` → `it/it_IT/riccardo/medium/`
- **License:** MIT
- **Installed by:** `node .claude/skills/speak-italian/scripts/setup-piper.mjs` (idempotent)

## Future (deferred)

- `it_IT-paola-medium` (female)
- `en_GB-alan-medium` / `en_US-lessac-medium` (English)

Do not commit `*.onnx` — `.gitignore` covers `voices/*.onnx` and `voices/*.onnx.json`.
Verify after setup:

```bash
echo "Ciao" | ~/.local/bin/piper --model .claude/skills/speak-italian/voices/it_IT-riccardo-medium.onnx --output_file /tmp/test.wav
ls -lh /tmp/test.wav
```
