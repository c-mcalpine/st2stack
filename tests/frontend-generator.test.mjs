import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { parseToIr } from '../packages/parser/src/index.mjs';
import { generateFrontendFromIr } from '../packages/worker/src/frontend-generator.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

test('frontend generator creates Next.js scaffold files with build/start scripts', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-front-'));
  const ir = await parseToIr(path.resolve('fixtures/streamlit_hf_equity_screener/app.py'));

  const result = await generateFrontendFromIr({ ir, outputDir: tmp });
  assert.equal(Array.isArray(result.files), true);

  const frontendDir = path.join(tmp, 'frontend');
  const pkg = await readJson(path.join(frontendDir, 'package.json'));

  assert.equal(pkg.scripts.build, 'next build');
  assert.equal(pkg.scripts.start, 'next start');
  assert.equal(typeof pkg.dependencies.next, 'string');

  const page = await fs.readFile(path.join(frontendDir, 'app/page.tsx'), 'utf8');
  assert.equal(page.includes('Run'), true);
  assert.equal(page.includes('Metric'), true);
  assert.equal(page.includes('Table'), true);

  const api = await fs.readFile(path.join(frontendDir, 'lib/api.ts'), 'utf8');
  assert.equal(api.includes('export type RunScreenRequest'), true);
  assert.equal(api.includes('export async function callRunScreen'), true);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('generated frontend build script wiring works with local next shim', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-front-build-'));
  const ir = await parseToIr(path.resolve('fixtures/streamlit_hf_equity_screener/app.py'));
  await generateFrontendFromIr({ ir, outputDir: tmp });

  const frontendDir = path.join(tmp, 'frontend');
  const binDir = path.join(frontendDir, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const shimPath = path.join(binDir, 'next');
  await fs.writeFile(shimPath, '#!/usr/bin/env bash\necho "next shim $@"\n', { encoding: 'utf8', mode: 0o755 });

  const result = spawnSync('npm', ['run', 'build'], { cwd: frontendDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal((result.stdout || '').includes('next shim build'), true);

  await fs.rm(tmp, { recursive: true, force: true });
});
