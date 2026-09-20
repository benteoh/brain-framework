---
name: speak-italian
description: Offline Italian TTS via Piper (it_IT-riccardo-x_low, male) — speak any Italian phrase to wav and play in Studio. Use when the user wants to hear Italian audio, practice pronunciation, or add 🔊 playback to Learning/Italian notes. Italian-only v0, male voice.
---

# Speak Italian (Piper, Offline)

## When to use

- User wants to **hear** an Italian phrase/pragraph spoken naturally.
- Adding `🔊` playback to a `Learning/Italian/Sessions/*.md` note or `Vocabulary.md`.
- Pronunciation check during a session.

Italian-only v0 — if the text is English, explain that English pack is deferred and offer to still synthesize with Italian voice (accented) or wait.

## Invocation policy — 1 auto + 2 on demand (agreed 2026-09-17)

Do NOT spam. Auto-speak only the **natural sentence** (conjugated chunk) once per turn, highlighted for click. Never auto-play infinitives or tense lists.

- **Auto (1/turn, highlighted, requires click): sentence** — e.g. `Abito nel Regno Unito.` / `Mi chiamo Ben.` / `Ti piace questo posto?` — the form you'll actually say. If >1 new item in the turn, only the first is auto-highlighted; ask `vuoi sentire gli altri?`.
- **On click `🔊 parola`:** isolated word slow→normal (e.g. `chiamarsi`) — `--slow` uses `--length_scale 1.4`, normal is `1.15` (15% slower than Piper default for clarity). Never auto.
- **On click `🔊 forme`:** 3 person-forms (tu/Lei contrast) as one wav with pauses — e.g. `mi chiamo, ti chiami, si chiama` or `abito, abiti, abita`. No tenses (`ho abitato`, `abiterò`) until Past/Future stage.
- **Cap:** 1 auto-highlighted clip per agent turn. No autoplay on load — browser requires gesture.
- **Why:** infinitive (`abitare`) has wrong stress vs `abito`; tense variants overload Basic exchanges (see `Learning/Italian/Italian.md:9`). Person forms are the useful contrast now.

## How to run

```bash
# one-time setup (downloads piper binary + it_IT-riccardo-x_low ~15MB)
node plugins/speak/skills/speak-italian/scripts/setup-piper.mjs

# CLI mode (default): synthesizes AND plays on your PC via mpv/paplay
node plugins/speak/skills/speak-italian/scripts/speak.mjs "Abito nel Regno Unito."
# → plays immediately; same as with --play. Use --no-play to just render wav for Studio/browser

# isolated word slow then normal (parola) — two calls, 1.3x then 1.0x
node plugins/speak/skills/speak-italian/scripts/speak.mjs "chiamarsi" --slow
node plugins/speak/skills/speak-italian/scripts/speak.mjs "chiamarsi"

# person-forms as one wav (forme) — comma gives pause
node plugins/speak/skills/speak-italian/scripts/speak.mjs "mi chiamo, ti chiami, si chiama"

# Studio/browser-only (no CLI playback): add --no-play, serve wav at /tts/<hash>.wav
node plugins/speak/skills/speak-italian/scripts/speak.mjs "Buongiorno!" --no-play
```

Output: `{"ok":true,"wav":"/tmp/brain-tts/<sha256>.wav","text":"...","voice":"it_IT-riccardo-x_low","cached":false,"slow":false}`

Cache: `/tmp/brain-tts/<hash>.wav` — key is `voice + text + slow` — re-uses on identical text.

## Voice

- Default v0: `it_IT-riccardo-x_low` (male, natural). No param needed.
- Files: `.claude/skills/speak-italian/voices/it_IT-riccardo-x_low.onnx` + `.onnx.json` (gitignored).
- Future: `it_IT-paola-medium` (female), `en_GB-alan-medium` (English) — same `speak.mjs --voice` flag.

## Studio hook

CLI mode (outside Studio): `speak.mjs` plays automatically on your PC (mpv/paplay) — no extra flag. This is now the default.

Studio/browser mode: pass `--no-play` so the wav is just rendered and served at `/tts/<hash>.wav` for the shell to play on click:

```html
Abito nel Regno Unito.
<button onclick="document.getElementById('w1').play()">🔊 parola</button><audio id="w1" src="/tts/<hash-word-slow>.wav"></audio>
<button onclick="document.getElementById('f1').play()">🔊 forme</button><audio id="f1" src="/tts/<hash-forme>.wav"></audio>
<!-- auto-highlighted sentence (one per turn, still requires click in browser) -->
<button class="auto" onclick="document.getElementById('s1').play()">🔊 ▶️</button><audio id="s1" src="/tts/<hash-sentence>.wav"></audio>
```

`serve.mjs` must serve `/tmp/brain-tts` at `/tts`.

## Limits

- 1..200 chars per call (sentences, not paragraphs — longer → split).
- Shell-safe: text is piped via stdin, never interpolated.
- No auto-play on page load — requires user gesture (auto = highlighted, not silent).
