import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanFile } from '../packages/scanner/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const fixturePath = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/app.py');
const expectedPath = path.join(repoRoot, 'fixtures/streamlit_hf_equity_screener/expected/scan.json');

test('scanner output matches expected scan fixture', async () => {
  const actual = await scanFile(fixturePath);
  const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'));

  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual, null, 4), JSON.stringify(expected, null, 4));
});
