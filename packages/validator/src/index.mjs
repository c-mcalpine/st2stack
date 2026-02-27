import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellRun(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
  });

  return {
    command,
    ok: result.status === 0,
    exit_code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function probeHealth(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { ok: true, status: res.status, error: '' };
      }
      lastError = `status=${res.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(250);
  }

  return { ok: false, status: null, error: lastError || 'health timeout' };
}

async function runBackendValidation(projectDir, backendConfig) {
  const compile = shellRun(backendConfig.compile_cmd, projectDir);
  const out = {
    compile,
    health: {
      command: backendConfig.start_cmd,
      url: backendConfig.health_url,
      ok: false,
      status: null,
      error: '',
      logs: '',
    },
    ok: false,
  };

  if (!compile.ok) {
    return out;
  }

  const proc = spawn(backendConfig.start_cmd, {
    cwd: projectDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  proc.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const health = await probeHealth(backendConfig.health_url, backendConfig.health_timeout_ms);
  out.health.ok = health.ok;
  out.health.status = health.status;
  out.health.error = health.error;
  out.health.logs = logs;
  out.ok = compile.ok && health.ok;

  proc.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, 1000);

    proc.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  return out;
}

function runFrontendValidation(projectDir, frontendConfig) {
  const build = shellRun(frontendConfig.build_cmd, projectDir);
  return {
    build,
    ok: build.ok,
  };
}

function defaultConfig(projectDir) {
  const backendDir = path.join(projectDir, 'backend');
  const frontendDir = path.join(projectDir, 'frontend');

  return {
    backend: {
      compile_cmd: `npm --prefix ${backendDir} run build`,
      start_cmd: `npm --prefix ${backendDir} run start`,
      health_url: 'http://127.0.0.1:3001/health',
      health_timeout_ms: 15000,
    },
    frontend: {
      build_cmd: `npm --prefix ${frontendDir} run build`,
    },
  };
}

export async function loadValidationConfig(projectDir, configPath) {
  if (!configPath) {
    return defaultConfig(projectDir);
  }

  const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return {
    backend: {
      compile_cmd: cfg.backend.compile_cmd,
      start_cmd: cfg.backend.start_cmd,
      health_url: cfg.backend.health_url,
      health_timeout_ms: cfg.backend.health_timeout_ms ?? 15000,
    },
    frontend: {
      build_cmd: cfg.frontend.build_cmd,
    },
  };
}

export async function validateGeneratedProject({ projectDir, configPath }) {
  const config = await loadValidationConfig(projectDir, configPath);
  const started_at = nowIso();

  const backend = await runBackendValidation(projectDir, config.backend);
  const frontend = runFrontendValidation(projectDir, config.frontend);

  const report = {
    validation_version: '1.0.0',
    project_dir: projectDir,
    started_at,
    finished_at: nowIso(),
    checks: {
      backend,
      frontend,
    },
    success: backend.ok && frontend.ok,
  };

  return report;
}

export async function validateAndWrite({ projectDir, configPath, outputPath }) {
  const report = await validateGeneratedProject({ projectDir, configPath });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}
