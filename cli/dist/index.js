#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseToIr } from '../../packages/parser/src/index.mjs';
import { validateGeneratedProject } from '../../packages/worker/src/validator.mjs';

function getArg(flag, args) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function runParse(args) {
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

async function runValidate(args) {
  const projectDir = getArg('--project', args);
  const out = getArg('--out', args);

  if (!projectDir) {
    console.error('Usage: node cli/dist/index.js validate --project <generated-project-dir> [--out <report.json>]');
    process.exit(1);
  }

  const report = await validateGeneratedProject({ projectDir });

  if (out) {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.success) {
    process.exit(2);
  }
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command === 'parse') {
    await runParse(args);
    return;
  }

  if (command === 'validate') {
    await runValidate(args);
    return;
  }

  console.error('Usage: node cli/dist/index.js <parse|validate> ...');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
