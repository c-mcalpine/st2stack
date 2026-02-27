import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { validateGeneratedProject } from '../packages/worker/src/validator.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createSampleProject({ withBuild = true } = {}) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-validate-'));

  const backendDir = path.join(projectDir, 'backend');
  const frontendDir = path.join(projectDir, 'frontend');

  await writeJson(path.join(backendDir, 'package.json'), {
    name: 'sample-backend',
    version: '1.0.0',
    private: true,
    scripts: {
      ...(withBuild ? { build: 'node --check server.mjs' } : {}),
      start: 'node server.mjs',
    },
  });

  await fs.writeFile(path.join(backendDir, 'server.mjs'), `
import http from 'node:http';
const port = Number(process.env.PORT || 3001);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});
server.listen(port, '0.0.0.0');
`.trimStart(), 'utf8');

  await writeJson(path.join(frontendDir, 'package.json'), {
    name: 'sample-frontend',
    version: '1.0.0',
    private: true,
    scripts: {
      build: "node -e \"console.log('frontend build ok')\"",
    },
  });

  return projectDir;
}

test('validation runner returns success report for valid generated project', async () => {
  const projectDir = await createSampleProject();
  const report = await validateGeneratedProject({ projectDir, backendPort: 3521 });

  assert.equal(report.success, true);
  assert.equal(report.checks.backend.passed, true);
  assert.equal(report.checks.frontend.passed, true);

  await fs.rm(projectDir, { recursive: true, force: true });
});

test('backend build is optional and can be configured explicitly', async () => {
  const projectDir = await createSampleProject({ withBuild: false });
  await writeJson(path.join(projectDir, 'st2stack.validation.json'), {
    backend: {
      build: null,
    },
  });

  const report = await validateGeneratedProject({ projectDir, backendPort: 3522 });
  assert.equal(report.success, true);
  assert.equal(report.checks.backend.steps.find((step) => step.name === 'compile').skipped, true);

  await fs.rm(projectDir, { recursive: true, force: true });
});

test('cli validate command writes JSON report', async () => {
  const projectDir = await createSampleProject();
  const outPath = path.join(projectDir, 'validation-report.json');

  const result = spawnSync('node', ['cli/dist/index.js', 'validate', '--project', projectDir, '--out', outPath], {
    cwd: path.resolve('.'),
  });

  assert.equal(result.status, 0, result.stderr?.toString() || result.stdout?.toString());

  const report = JSON.parse(await fs.readFile(outPath, 'utf8'));
  assert.equal(report.success, true);

  await fs.rm(projectDir, { recursive: true, force: true });
});

test('worker validate command exits non-zero on failed validation', async () => {
  const projectDir = await createSampleProject();
  const frontendPackagePath = path.join(projectDir, 'frontend', 'package.json');
  const frontendPackage = JSON.parse(await fs.readFile(frontendPackagePath, 'utf8'));
  delete frontendPackage.scripts.build;
  await writeJson(frontendPackagePath, frontendPackage);

  const result = spawnSync('node', ['packages/worker/src/worker.mjs', 'validate', projectDir], {
    cwd: path.resolve('.'),
  });

  assert.equal(result.status, 2);

  await fs.rm(projectDir, { recursive: true, force: true });
});
