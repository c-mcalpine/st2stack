import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve('.');
const fixtureEntry = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/app.py');

function runCli(args) {
  return spawnSync('node', ['cli/dist/index.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('cli convert writes scan, ir, generated apps, and validation report', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-convert-'));

  const result = runCli(['convert', '--entry', fixtureEntry, '--out', outDir]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const requiredPaths = [
    path.join(outDir, 'ir.json'),
    path.join(outDir, 'backend', 'package.json'),
    path.join(outDir, 'frontend', 'package.json'),
    path.join(outDir, 'validation.report.json'),
    path.join(outDir, 'st2stack.validation.json'),
  ];

  for (const requiredPath of requiredPaths) {
    await fs.access(requiredPath);
  }

  const report = JSON.parse(await fs.readFile(path.join(outDir, 'validation.report.json'), 'utf8'));
  assert.equal(report.success, true);

  const topLevel = (await fs.readdir(outDir)).sort();
  assert.deepEqual(topLevel, ['backend', 'frontend', 'ir.json', 'st2stack.validation.json', 'validation.report.json']);

  await fs.rm(outDir, { recursive: true, force: true });
});

test('cli convert can optionally write a zip artifact', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-convert-zip-'));
  const zipPath = path.join(outDir, 'artifact.zip');

  const result = runCli(['convert', '--entry', fixtureEntry, '--out', outDir, '--zip', zipPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const zipStat = await fs.stat(zipPath);
  assert.equal(zipStat.isFile(), true);
  assert.ok(zipStat.size > 0);

  await fs.rm(outDir, { recursive: true, force: true });
});

test('cli convert exits 1 for internal errors', () => {
  const outDir = path.join(os.tmpdir(), `st2stack-convert-error-${Date.now()}`);
  const result = runCli(['convert', '--entry', path.join(repoRoot, 'fixtures/does-not-exist.py'), '--out', outDir]);

  assert.equal(result.status, 1, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});


test('cli convert output is deterministic except validation timestamps', async () => {
  const outDirA = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-convert-a-'));
  const outDirB = await fs.mkdtemp(path.join(os.tmpdir(), 'st2stack-convert-b-'));

  const resultA = runCli(['convert', '--entry', fixtureEntry, '--out', outDirA]);
  assert.equal(resultA.status, 0, resultA.stderr || resultA.stdout);

  const resultB = runCli(['convert', '--entry', fixtureEntry, '--out', outDirB]);
  assert.equal(resultB.status, 0, resultB.stderr || resultB.stdout);

  const filesA = ['ir.json', 'st2stack.validation.json', path.join('backend', 'package.json'), path.join('frontend', 'package.json')];

  for (const file of filesA) {
    const [a, b] = await Promise.all([
      fs.readFile(path.join(outDirA, file), 'utf8'),
      fs.readFile(path.join(outDirB, file), 'utf8'),
    ]);
    assert.equal(a, b, `${file} should be deterministic`);
  }

  const reportA = JSON.parse(await fs.readFile(path.join(outDirA, 'validation.report.json'), 'utf8'));
  const reportB = JSON.parse(await fs.readFile(path.join(outDirB, 'validation.report.json'), 'utf8'));

  delete reportA.started_at;
  delete reportA.completed_at;
  delete reportB.started_at;
  delete reportB.completed_at;

  assert.deepEqual(reportA, reportB);

  await fs.rm(outDirA, { recursive: true, force: true });
  await fs.rm(outDirB, { recursive: true, force: true });
});
