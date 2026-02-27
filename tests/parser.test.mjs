import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import Ajv2020 from 'ajv/dist/2020.js';

import { parseToIr } from '../packages/parser/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const fixturePath = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/app.py');
const expectedPath = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/expected/ir.json');
const schemaPath = path.join(repoRoot, 'schema/ir.schema.json');

test('parser output matches expected IR fixture', async () => {
  const actual = await parseToIr(fixturePath);
  const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'));

  assert.deepEqual(actual, expected);
});

test('parser output validates against schema', async () => {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  const actual = await parseToIr(fixturePath);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(actual);
  assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
});

test('cli parse command writes output', async () => {
  const outPath = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/generated/ir.from-test.json');
  const result = spawnSync('node', ['cli/dist/index.js', 'parse', '--entry', fixturePath, '--out', outPath], { cwd: repoRoot });
  assert.equal(result.status, 0, result.stderr?.toString() ?? '');

  const written = JSON.parse(await fs.readFile(outPath, 'utf8'));
  const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'));
  assert.deepEqual(written, expected);

  await fs.unlink(outPath);
});
