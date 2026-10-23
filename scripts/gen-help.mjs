#!/usr/bin/env node
// Copies the single-source user guide (shared/help/guide.json + routes.json)
// into the app as a generated, git-ignored module — the help counterpart of
// `gen:i18n`. The shared validator runs first so a guide that drifted from the
// string catalog / routes / permission schema can never ship inside the app.
//   node scripts/gen-help.mjs            → src/generated/help/{guide,routes}.json
// Pure Node, no dependencies. Exits non-zero when validation fails.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_HELP = join(ROOT, 'shared', 'help');
const OUT_DIR = join(ROOT, 'src', 'generated', 'help');

const validate = spawnSync(process.execPath, [join(ROOT, 'shared', 'scripts', 'validate-help.mjs')], {
  stdio: 'inherit',
});
if (validate.status !== 0) {
  console.error('gen-help: shared help validation failed — not copying the guide.');
  process.exit(validate.status ?? 1);
}

// Sanity: the guide must be the schema version this app understands.
const guide = JSON.parse(readFileSync(join(SHARED_HELP, 'guide.json'), 'utf8'));
if (guide.version !== 1) {
  console.error(`gen-help: unsupported guide schema version ${guide.version} (expected 1)`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const file of ['guide.json', 'routes.json']) {
  copyFileSync(join(SHARED_HELP, file), join(OUT_DIR, file));
  console.log(`wrote ${join(OUT_DIR, file)}`);
}
