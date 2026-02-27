import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 500;
const DEFAULT_LOG_TAIL_CHARS = 50_000;

function nowIso() {
  return new Date().toISOString();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function appendTail(current, chunk, maxChars) {
  const next = current + chunk;
  if (next.length <= maxChars) {
    return next;
  }
  return next.slice(next.length - maxChars);
}

function argsFromCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return [];
  }

  return command.trim().split(/\s+/);
}

function runCommand({ cmd, args, cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, logTailChars = DEFAULT_LOG_TAIL_CHARS }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout = appendTail(stdout, data.toString(), logTailChars);
    });

    child.stderr.on('data', (data) => {
      stderr = appendTail(stderr, data.toString(), logTailChars);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        signal,
        cmd: [cmd, ...args].join(' '),
        cwd,
        stdout,
        stderr,
        started_at: new Date(startedAt).toISOString(),
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        log_tail_chars: logTailChars,
      });
    });
  });
}

async function terminateProcessTree(child, timeoutMs = 5_000) {
  if (child.exitCode !== null) {
    return;
  }

  const isWindows = process.platform === 'win32';
  const pid = child.pid;

  if (isWindows) {
    await runCommand({ cmd: 'taskkill', args: ['/pid', String(pid), '/t', '/f'], cwd: process.cwd(), timeoutMs: 5_000 });
    return;
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // ignore already-exited process
        }
      }
    }, timeoutMs);

    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function readPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw);
}

async function installDependencies(packageDir, commandOverride) {
  if (commandOverride) {
    const args = argsFromCommand(commandOverride);
    return runCommand({ cmd: args[0], args: args.slice(1), cwd: packageDir });
  }

  const hasLock = await exists(path.join(packageDir, 'package-lock.json'));
  if (hasLock) {
    return runCommand({ cmd: 'npm', args: ['ci'], cwd: packageDir });
  }

  return runCommand({ cmd: 'npm', args: ['install'], cwd: packageDir });
}

async function waitForHealth({ url, timeoutMs, intervalMs }) {
  const started = Date.now();
  let lastError = '';

  while ((Date.now() - started) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        return { ok: true, status: response.status, error: null };
      }
      lastError = `unexpected status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ok: false, status: null, error: lastError || 'health check timed out' };
}

async function loadValidationConfig(projectDir, options) {
  const configPath = path.join(projectDir, 'st2stack.validation.json');

  const defaults = {
    backend: {
      dir: options.backendDirName || 'backend',
      install: null,
      build: 'npm run build',
      start: 'npm run start',
      health_url: null,
      startup_timeout_ms: DEFAULT_STARTUP_TIMEOUT_MS,
      health_poll_interval_ms: DEFAULT_HEALTH_POLL_INTERVAL_MS,
      env: {},
    },
    frontend: {
      dir: options.frontendDirName || 'frontend',
      install: null,
      build: 'npm run build',
    },
  };

  if (!(await exists(configPath))) {
    return defaults;
  }

  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);

  return {
    backend: { ...defaults.backend, ...(parsed.backend || {}) },
    frontend: { ...defaults.frontend, ...(parsed.frontend || {}) },
  };
}

async function validateBackend(projectDir, backendConfig, options) {
  const backendDir = path.join(projectDir, backendConfig.dir);
  const report = {
    service: 'backend',
    path: backendDir,
    passed: false,
    contract: {
      package_json: path.join(backendDir, 'package.json'),
      start_required: true,
      build_optional: true,
      config_file: 'st2stack.validation.json',
    },
    steps: [],
  };

  const packageJsonPath = path.join(backendDir, 'package.json');
  if (!(await exists(packageJsonPath))) {
    report.steps.push({ name: 'precheck', ok: false, error: 'missing backend/package.json' });
    return report;
  }

  const packageJson = await readPackageJson(backendDir);
  const scripts = packageJson.scripts || {};

  const installResult = await installDependencies(backendDir, backendConfig.install);
  report.steps.push({ name: 'install', ...installResult });
  if (!installResult.ok) {
    return report;
  }

  const compileCommand = backendConfig.build;
  if (compileCommand) {
    const compileArgs = argsFromCommand(compileCommand);
    const compileResult = await runCommand({ cmd: compileArgs[0], args: compileArgs.slice(1), cwd: backendDir });
    report.steps.push({ name: 'compile', ...compileResult });
    if (!compileResult.ok) {
      return report;
    }
  } else {
    report.steps.push({ name: 'compile', ok: true, skipped: true, reason: 'no build command configured' });
  }

  const startCommand = backendConfig.start || (scripts.start ? 'npm run start' : null);
  if (!startCommand) {
    report.steps.push({ name: 'health', ok: false, error: 'missing backend start command (script or config)' });
    return report;
  }

  const healthUrl = backendConfig.health_url || options.backendHealthUrl || `http://127.0.0.1:${options.backendPort || 3411}/health`;
  const startArgs = argsFromCommand(startCommand);
  const startupTimeoutMs = backendConfig.startup_timeout_ms || DEFAULT_STARTUP_TIMEOUT_MS;
  const pollIntervalMs = backendConfig.health_poll_interval_ms || DEFAULT_HEALTH_POLL_INTERVAL_MS;

  const backendProcess = spawn(startArgs[0], startArgs.slice(1), {
    cwd: backendDir,
    env: {
      ...process.env,
      ...backendConfig.env,
      PORT: String(options.backendPort || 3411),
      HOST: '0.0.0.0',
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  backendProcess.stdout.on('data', (data) => {
    stdout = appendTail(stdout, data.toString(), DEFAULT_LOG_TAIL_CHARS);
  });
  backendProcess.stderr.on('data', (data) => {
    stderr = appendTail(stderr, data.toString(), DEFAULT_LOG_TAIL_CHARS);
  });

  const health = await waitForHealth({
    url: healthUrl,
    timeoutMs: startupTimeoutMs,
    intervalMs: pollIntervalMs,
  });

  await terminateProcessTree(backendProcess);

  report.steps.push({
    name: 'health',
    ok: health.ok,
    url: healthUrl,
    status: health.status,
    error: health.error,
    startup_timeout_ms: startupTimeoutMs,
    health_poll_interval_ms: pollIntervalMs,
    stdout,
    stderr,
    log_tail_chars: DEFAULT_LOG_TAIL_CHARS,
  });

  report.passed = report.steps.every((step) => step.ok === true);
  return report;
}

async function validateFrontend(projectDir, frontendConfig) {
  const frontendDir = path.join(projectDir, frontendConfig.dir);
  const report = {
    service: 'frontend',
    path: frontendDir,
    passed: false,
    steps: [],
  };

  const packageJsonPath = path.join(frontendDir, 'package.json');
  if (!(await exists(packageJsonPath))) {
    report.steps.push({ name: 'precheck', ok: false, error: 'missing frontend/package.json' });
    return report;
  }

  const installResult = await installDependencies(frontendDir, frontendConfig.install);
  report.steps.push({ name: 'install', ...installResult });
  if (!installResult.ok) {
    return report;
  }

  if (!frontendConfig.build) {
    report.steps.push({ name: 'build', ok: false, error: 'missing frontend build command in config' });
    return report;
  }

  const buildArgs = argsFromCommand(frontendConfig.build);
  const buildResult = await runCommand({ cmd: buildArgs[0], args: buildArgs.slice(1), cwd: frontendDir, timeoutMs: 90_000 });
  report.steps.push({ name: 'build', ...buildResult });
  report.passed = report.steps.every((step) => step.ok === true);
  return report;
}

export async function validateGeneratedProject(options) {
  const startedAt = nowIso();
  const projectDir = path.resolve(options.projectDir);
  const config = await loadValidationConfig(projectDir, options);

  const backend = await validateBackend(projectDir, config.backend, options);
  const frontend = await validateFrontend(projectDir, config.frontend);

  return {
    version: '1.1.0',
    started_at: startedAt,
    completed_at: nowIso(),
    project_dir: projectDir,
    config_used: {
      backend: config.backend,
      frontend: config.frontend,
    },
    success: backend.passed && frontend.passed,
    checks: {
      backend,
      frontend,
    },
  };
}
