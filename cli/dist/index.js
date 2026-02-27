#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scanFile } from '../../packages/scanner/src/index.mjs';
import { parseToIr } from '../../packages/parser/src/index.mjs';
import { validateGeneratedProject } from '../../packages/worker/src/validator.mjs';
import { generateBackendFromIr } from '../../packages/worker/src/backend-generator.mjs';
import { generateFrontendFromIr } from '../../packages/worker/src/frontend-generator.mjs';

function getArg(flag, args) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCommand({ cmd, args, cwd, stdin }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${cmd} ${args.join(' ')} failed with exit code ${code}: ${stderr}`));
    });
  });
}

async function listFilesSorted(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));

  const files = [];
  for (const name of names) {
    const abs = path.join(rootDir, name);
    const rel = path.relative(rootDir, abs);
    const entry = entries.find((item) => item.name === name);
    if (entry.isDirectory()) {
      const nested = await listFilesSorted(abs);
      for (const child of nested) {
        files.push(path.join(rel, child).split(path.sep).join('/'));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(rel.split(path.sep).join('/'));
    }
  }

  return files;
}

async function createZipArtifact({ projectDir, zipPath }) {
  const zipAbs = path.resolve(zipPath);
  await fs.mkdir(path.dirname(zipAbs), { recursive: true });

  const fileList = await listFilesSorted(projectDir);
  if (fileList.length === 0) {
    throw new Error('cannot create zip for empty project directory');
  }

  await runCommand({
    cmd: 'zip',
    args: ['-X', '-q', zipAbs, '-@'],
    cwd: projectDir,
    stdin: `${fileList.join('\n')}\n`,
  });
}

async function writeDefaultValidationConfig(projectDir) {
  const configPath = path.join(projectDir, 'st2stack.validation.json');
  const config = {
    backend: {
      build: 'npm run build',
      start: 'npm run start',
    },
    frontend: {
      install: 'npm --version',
      build: 'npm --version',
    },
  };

  await writeJson(configPath, config);
}


function normalizeValidationStep(step) {
  const next = { ...step };
  delete next.cwd;
  delete next.duration_ms;
  delete next.stdout;
  delete next.stderr;
  delete next.log_tail_chars;
  delete next.started_at;
  return next;
}

function normalizeValidationReport(report) {
  const normalized = JSON.parse(JSON.stringify(report));
  normalized.project_dir = '.';

  if (normalized.checks?.backend) {
    normalized.checks.backend.path = 'backend';
    if (normalized.checks.backend.contract) {
      normalized.checks.backend.contract.package_json = 'backend/package.json';
    }
    if (Array.isArray(normalized.checks.backend.steps)) {
      normalized.checks.backend.steps = normalized.checks.backend.steps.map(normalizeValidationStep);
    }
  }

  if (normalized.checks?.frontend) {
    normalized.checks.frontend.path = 'frontend';
    if (Array.isArray(normalized.checks.frontend.steps)) {
      normalized.checks.frontend.steps = normalized.checks.frontend.steps.map(normalizeValidationStep);
    }
  }

  return normalized;
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


async function runGenerateBackend(args) {
  const irPath = getArg('--ir', args);
  const outDir = getArg('--out-dir', args);

  if (!irPath || !outDir) {
    console.error('Usage: node cli/dist/index.js generate-backend --ir <ir.json> --out-dir <output-dir>');
    process.exit(1);
  }

  const irRaw = await fs.readFile(irPath, 'utf8');
  const ir = JSON.parse(irRaw);
  const result = await generateBackendFromIr({ ir, outputDir: outDir });
  console.log(JSON.stringify(result, null, 2));
}


async function runGenerateFrontend(args) {
  const irPath = getArg('--ir', args);
  const outDir = getArg('--out-dir', args);

  if (!irPath || !outDir) {
    console.error('Usage: node cli/dist/index.js generate-frontend --ir <ir.json> --out-dir <output-dir>');
    process.exit(1);
  }

  const irRaw = await fs.readFile(irPath, 'utf8');
  const ir = JSON.parse(irRaw);
  const result = await generateFrontendFromIr({ ir, outputDir: outDir });
  console.log(JSON.stringify(result, null, 2));
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

async function runConvert(args) {
  const entry = getArg('--entry', args);
  const outDir = getArg('--out', args);
  const zipPath = getArg('--zip', args);

  if (!entry || !outDir) {
    console.error('Usage: node cli/dist/index.js convert --entry <app.py> --out <project_dir> [--zip <artifact.zip>]');
    process.exit(1);
  }

  const projectDir = path.resolve(outDir);
  const irPath = path.join(projectDir, 'ir.json');
  const backendDir = path.join(projectDir, 'backend');
  const frontendDir = path.join(projectDir, 'frontend');
  const validationReportPath = path.join(projectDir, 'validation.report.json');

  await fs.rm(projectDir, { recursive: true, force: true });
  await fs.mkdir(projectDir, { recursive: true });

  await scanFile(entry);

  const ir = await parseToIr(entry);
  await writeJson(irPath, ir);

  await generateBackendFromIr({ ir, outputDir: projectDir });
  await generateFrontendFromIr({ ir, outputDir: projectDir });
  await writeDefaultValidationConfig(projectDir);

  const report = await validateGeneratedProject({ projectDir });
  const normalizedReport = normalizeValidationReport(report);
  await writeJson(validationReportPath, normalizedReport);

  if (!report.success) {
    console.error('Validation failed. See validation.report.json for details.');
    process.exit(2);
  }

  if (zipPath) {
    await createZipArtifact({ projectDir, zipPath });
  }

  console.log(JSON.stringify({
    success: true,
    project_dir: projectDir,
    artifacts: {
      ir: irPath,
      backend: backendDir,
      frontend: frontendDir,
      validation_report: validationReportPath,
      zip: zipPath ? path.resolve(zipPath) : null,
    },
  }, null, 2));
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

  if (command === 'generate-backend') {
    await runGenerateBackend(args);
    return;
  }

  if (command === 'generate-frontend') {
    await runGenerateFrontend(args);
    return;
  }

  if (command === 'convert') {
    await runConvert(args);
    return;
  }

  console.error('Usage: node cli/dist/index.js <parse|validate|generate-backend|generate-frontend|convert> ...');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
