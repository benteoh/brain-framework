---
name: brain
description: Initialise, inspect, validate, update, and extend a Brain instance. Use when managing framework files or optional Brain plugins.
---

# Manage Brain

Use the bundled manager for structural operations. Do not improvise file copies when a command exists.

```bash
node skills/brain/scripts/brain.mjs validate
node skills/brain/scripts/brain.mjs init --target /path/to/brain
node skills/brain/scripts/brain.mjs sync --target /path/to/brain
node skills/brain/scripts/brain.mjs update --to VERSION --target /path/to/brain
node skills/brain/scripts/brain.mjs plugin add <name> --target /path/to/brain
node skills/brain/scripts/brain.mjs status --target /path/to/brain
```

The manager preserves user-owned knowledge and refuses to overwrite locally modified managed files. Resolve conflicts explicitly with the user; never discard their version automatically.

A private Brain tracks only `.brain/manifest.json` in Git; installed skills, installed plugins, and machine-local manager state (`.brain/local.json`, `.brain/managed-files.json`) are ignored and reproducible. After cloning a private Brain on a new machine, or whenever installed dependencies are missing, run `sync` to restore them from the tracked manifest — do not recreate them by hand. `update` always requires an explicit `--to VERSION` that matches the source framework's own version; it never resolves an implicit "latest" branch. Make durable dependency changes in this framework's source (or a plugin's source), then reinstall with `sync` or `update`.
