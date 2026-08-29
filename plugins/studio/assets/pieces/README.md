# Piece art

Source SVGs for the chess piece sets rendered by `board-shell` and `chapter-shell`.

These files are the source of truth. The shells do not read them at runtime — shells are
self-contained single files with no build step — so the art is compiled into an inline `<defs>`
block of `<symbol>`s and committed into each template. Regenerate with:

```bash
node plugins/studio/scripts/build-piece-defs.mjs --set chessnut --prefix pc \
  --into plugins/studio/templates/board-shell.html \
  --into plugins/studio/templates/chapter-shell.html
```

`--check` verifies the committed block matches the source art without writing, which is what the
test suite uses.

## Why vectors rather than Unicode glyphs

The shells originally drew pieces as `♔♕♖` text. Three problems, all visible in practice: glyph
shapes vary with whichever font the reader happens to have, the white pieces are hollow outlines
that wash out against a light square (the old code compensated with a stroke hack), and text does
not scale crisply with the board.

## Licensing

Piece sets are third-party artwork with their own licences, tracked here rather than assumed.

| Set | Author | Licence |
|---|---|---|
| `chessnut` | [Alexis Luengas](https://github.com/LexLuengas/chessnut-pieces) | Apache-2.0 (`chessnut/LICENSE.txt`) |

`chessnut` was chosen partly because Apache-2.0 is permissive: it imposes no copyleft obligation
on the rest of this repository. The widely-used `cburnett` and `merida` sets are GPLv2+, which is
usable but would mean shipping that licence and its obligations alongside anything distributing
the templates. If you swap in a set, record its licence in this table and keep its licence file
next to the art.
