---
name: brain
description: Initialise, inspect, validate, update, and extend a Brain instance. Use when managing framework files or optional Brain plugins.
---

# Manage Brain

Use the bundled manager for structural operations. Do not improvise file copies when a command exists.

```bash
node skills/brain/scripts/brain.mjs validate
node skills/brain/scripts/brain.mjs init --target /path/to/brain
node skills/brain/scripts/brain.mjs update --target /path/to/brain
node skills/brain/scripts/brain.mjs plugin add <name> --target /path/to/brain
node skills/brain/scripts/brain.mjs status --target /path/to/brain
```

The manager preserves user-owned knowledge and refuses to overwrite locally modified managed files. Resolve conflicts explicitly with the user; never discard their version automatically.
