import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateGeneratedProject } from '../packages/validator/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests/fixtures/validator');
const configPath = path.join(fixtureRoot, 'validation.config.json');

test('validation runner returns successful report for fixture project', async () => {
  const report = await validateGeneratedProject({
    projectDir: fixtureRoot,
    configPath,
  });

  assert.equal(report.success, true);
  assert.equal(report.checks.backend.compile.ok, true);
  assert.equal(report.checks.backend.health.ok, true);
  assert.equal(report.checks.frontend.build.ok, true);
});

test('cli validate command writes JSON report', async () => {
  const outputPath = path.join(fixtureRoot, 'report.from-cli.json');

  const result = spawnSync(
    'node',
    ['cli/dist/index.js', 'validate', '--project', fixtureRoot, '--config', configPath, '--out', outputPath],
    { cwd: repoRoot },
  );

  assert.equal(result.status, 0, result.stderr?.toString() ?? '');

  const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  assert.equal(written.success, true);
  assert.equal(written.checks.backend.health.ok, true);

  await fs.unlink(outputPath);
});
