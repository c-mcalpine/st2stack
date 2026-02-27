import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

import { parseToIr } from '../packages/parser/src/index.mjs';
import { generateBackendFromIr } from '../packages/worker/src/backend-generator.mjs';
import { validateGeneratedProject } from '../packages/worker/src/validator.mjs';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        return;
      }
    } catch {
      // keep polling
    }
    await wait(200);
  }

  throw new Error(`Timed out waiting for health at ${url}`);
}

async function makeFixtureProject() {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-m3-'));
  const entry = path.resolve('fixtures/streamlit_hf_equity_screener/app.py');
  const ir = await parseToIr(entry);

  await generateBackendFromIr({ ir, outputDir: projectDir });

  await fs.mkdir(path.join(projectDir, 'frontend'), { recursive: true });
  await fs.writeFile(path.join(projectDir, 'frontend', 'package.json'), `${JSON.stringify({
    name: 'generated-frontend',
    private: true,
    version: '0.0.1',
    scripts: {
      build: "node -e \"console.log('frontend build ok')\"",
    },
  }, null, 2)}\n`, 'utf8');

  return { projectDir, ir };
}

test('backend generator creates Fastify scaffold that passes validator', async () => {
  const { projectDir } = await makeFixtureProject();
  const report = await validateGeneratedProject({ projectDir, backendPort: 3541 });

  assert.equal(report.success, true, JSON.stringify(report, null, 2));
  assert.equal(report.checks.backend.passed, true);
  assert.equal(report.checks.frontend.passed, true);

  await fs.rm(projectDir, { recursive: true, force: true });
});

test('generated backend validates request and returns schema-shaped response', async () => {
  const { projectDir, ir } = await makeFixtureProject();
  const backendDir = path.join(projectDir, 'backend');
  const install = spawnSync('npm', ['install'], { cwd: backendDir, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr || install.stdout);

  const port = 3542;
  const server = spawn('npm', ['run', 'start'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port), HOST: '0.0.0.0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitForHealth(`http://127.0.0.1:${port}/health`);

  const endpoint = ir.backend_plan.endpoints[0];
  const invalid = await fetch(`http://127.0.0.1:${port}${endpoint.path}`, {
    method: endpoint.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`http://127.0.0.1:${port}${endpoint.path}`, {
    method: endpoint.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      lookback_days: 90,
      value_weight: 0.3,
      momentum_weight: 0.3,
      quality_weight: 0.4,
    }),
  });

  assert.equal(valid.status, 200);
  const body = await valid.json();
  assert.deepEqual(Object.keys(body).sort(), ['columns', 'rows']);

  server.kill('SIGTERM');
  await fs.rm(projectDir, { recursive: true, force: true });
  assert.equal(stderr.includes('invalid_response_shape'), false);
});
