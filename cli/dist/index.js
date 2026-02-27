#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseToIr } from '../../packages/parser/src/index.mjs';
import { validateAndWrite } from '../../packages/validator/src/index.mjs';

function getArg(flag, args) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function usage() {
  console.error('Usage:');
  console.error('  node cli/dist/index.js parse --entry <path> --out <path>');
  console.error('  node cli/dist/index.js validate --project <path> --out <path> [--config <path>]');
}

async function runParse(args) {
  const entry = getArg('--entry', args);
  const out = getArg('--out', args);

  if (!entry || !out) {
    usage();
    process.exit(1);
  }

  const ir = await parseToIr(entry);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(ir, null, 4)}\n`, 'utf8');
}

async function runValidate(args) {
  const project = getArg('--project', args);
  const out = getArg('--out', args);
  const config = getArg('--config', args);

  if (!project || !out) {
    usage();
    process.exit(1);
  }

  const report = await validateAndWrite({
    projectDir: project,
    configPath: config,
    outputPath: out,
  });

  if (!report.success) {
    process.exit(1);
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

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
