#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseToIr } from '../../packages/parser/src/index.mjs';

function getArg(flag, args) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command !== 'parse') {
    console.error('Usage: node cli/dist/index.js parse --entry <path> --out <path>');
    process.exit(1);
  }

  const entry = getArg('--entry', args);
  const out = getArg('--out', args);

  if (!entry || !out) {
    console.error('Usage: node cli/dist/index.js parse --entry <path> --out <path>');
    process.exit(1);
  }

  const ir = await parseToIr(entry);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(ir, null, 4)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
