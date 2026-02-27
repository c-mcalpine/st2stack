import fs from 'node:fs/promises';
import path from 'node:path';

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return fallback;
}

function toTsType(typeName) {
  const raw = String(typeName || '').trim();
  const listMatch = raw.match(/^list\s*\[(.*)\]$/i);
  if (listMatch) {
    return `${toTsType(listMatch[1])}[]`;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'date' || normalized === 'string') return 'string';
  if (normalized === 'number' || normalized === 'int' || normalized === 'float') return 'number';
  if (normalized === 'boolean' || normalized === 'bool') return 'boolean';
  if (normalized === 'dict' || normalized === 'object') return 'Record<string, unknown>';

  return 'unknown';
}

function defaultValue(typeName) {
  const raw = String(typeName || '').trim();
  const listMatch = raw.match(/^list\s*\[(.*)\]$/i);
  if (listMatch) return '[]';

  const normalized = raw.toLowerCase();
  if (normalized === 'date' || normalized === 'string') return "''";
  if (normalized === 'number' || normalized === 'int' || normalized === 'float') return '0';
  if (normalized === 'boolean' || normalized === 'bool') return 'false';
  if (normalized === 'dict' || normalized === 'object') return '{}';

  return 'null';
}

function collectInputs(ir) {
  const fromState = asObject(ir.state)?.inputs || {};
  const uiNodes = Array.isArray(ir.ui_tree) ? ir.ui_tree : [];

  const labelsByBinding = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'input' && typeof node.binds_to === 'string') {
      labelsByBinding.set(node.binds_to, node.label || node.binds_to);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  };
  for (const node of uiNodes) walk(node);

  return Object.entries(fromState).map(([name, def]) => ({
    name,
    dataType: def?.data_type || 'string',
    label: labelsByBinding.get(name) || name,
  }));
}

function renderApiSource(ir) {
  const backendPlan = asObject(ir.backend_plan);
  const schemas = asObject(backendPlan.schemas);
  const endpoints = Array.isArray(backendPlan.endpoints) ? backendPlan.endpoints : [];

  const schemaTypes = Object.entries(schemas)
    .map(([schemaName, schemaDef]) => {
      const fields = Object.entries(asObject(schemaDef))
        .map(([field, fieldType]) => `  ${JSON.stringify(field)}: ${toTsType(fieldType)};`)
        .join('\n');
      return `export type ${schemaName} = {\n${fields}\n};`;
    })
    .join('\n\n');

  const fetchers = endpoints.map((endpoint) => {
    const fnName = `call${String(endpoint.name || 'Endpoint').replace(/(^\w|_\w)/g, (m) => m.replace('_', '').toUpperCase())}`;
    return `export async function ${fnName}(payload: ${endpoint.request_schema}): Promise<${endpoint.response_schema}> {
  const response = await fetch(
    BACKEND_BASE_URL + ${JSON.stringify(endpoint.path)},
    {
      method: ${JSON.stringify(String(endpoint.method || 'POST').toUpperCase())},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error('${fnName} failed: ' + response.status + ' ' + text);
  }

  return response.json() as Promise<${endpoint.response_schema}>;
}`;
  }).join('\n\n');

  const firstEndpoint = endpoints[0];
  const runFn = firstEndpoint
    ? `export const runEndpoint = call${String(firstEndpoint.name || 'Endpoint').replace(/(^\w|_\w)/g, (m) => m.replace('_', '').toUpperCase())};`
    : `export const runEndpoint = async (_payload: Record<string, unknown>) => ({ ok: true });`;

  const runReqType = firstEndpoint ? firstEndpoint.request_schema : 'Record<string, unknown>';
  const runResType = firstEndpoint ? firstEndpoint.response_schema : 'Record<string, unknown>';

  return `export const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://127.0.0.1:3411';

${schemaTypes || '// No backend schemas found in IR.'}

${fetchers || '// No backend endpoints found in IR.'}

export type RunRequest = ${runReqType};
export type RunResponse = ${runResType};
${runFn}
`;
}

function renderSidebarComponent(ir) {
  const inputs = collectInputs(ir);
  const backendPlan = asObject(ir.backend_plan);
  const endpoints = Array.isArray(backendPlan.endpoints) ? backendPlan.endpoints : [];
  const firstEndpoint = endpoints[0];

  const endpointSchema = firstEndpoint ? asObject(asObject(backendPlan.schemas)[firstEndpoint.request_schema]) : {};
  const endpointFields = Object.entries(endpointSchema);

  const formFields = endpointFields.map(([name, typeName]) => {
    const parsed = String(typeName).toLowerCase();
    const inputType = parsed.includes('number') || parsed === 'int' || parsed === 'float' ? 'number' : 'text';
    return `        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">${name}</span>
          <input
            className="w-full rounded border px-3 py-2"
            type="${inputType}"
            value={String(formState[${JSON.stringify(name)}] ?? '')}
            onChange={(event) => {
              const raw = event.target.value;
              const nextValue = ${inputType === 'number' ? "raw === '' ? 0 : Number(raw)" : 'raw'};
              onFormChange({ ...formState, ${JSON.stringify(name)}: nextValue });
            }}
          />
        </label>`;
  }).join('\n\n');

  const initialShape = endpointFields.map(([name, typeName]) => `  ${JSON.stringify(name)}: ${defaultValue(typeName)}`).join(',\n');

  const inputSummary = inputs.map((item) => `        <li><strong>${item.label}:</strong> ${item.dataType}</li>`).join('\n');

  return `'use client';

type SidebarFormProps = {
  formState: Record<string, unknown>;
  onFormChange: (next: Record<string, unknown>) => void;
  onRun: () => Promise<void>;
  running: boolean;
};

export const initialRunForm: Record<string, unknown> = {
${initialShape || "  run: true"}
};

export function SidebarForm({ formState, onFormChange, onRun, running }: SidebarFormProps) {
  return (
    <aside className="rounded border p-4">
      <h2 className="mb-3 text-lg font-semibold">Inputs</h2>
      <ul className="mb-4 list-disc pl-4 text-sm text-gray-700">
${inputSummary || '        <li>No sidebar inputs found in IR.</li>'}
      </ul>

${formFields || '      <p className="mb-3 text-sm text-gray-600">No request fields found for run endpoint.</p>'}

      <button className="rounded bg-black px-4 py-2 text-white" onClick={() => void onRun()} disabled={running}>
        {running ? 'Running...' : 'Run'}
      </button>
    </aside>
  );
}
`;
}

function renderPageSource() {
  return `'use client';

import { useMemo, useState } from 'react';
import { SidebarForm, initialRunForm } from '../components/SidebarForm';
import { runEndpoint, type RunResponse } from '../lib/api';

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
}

export default function HomePage() {
  const [formState, setFormState] = useState<Record<string, unknown>>(initialRunForm);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const rows = useMemo(() => {
    if (!result || typeof result !== 'object') return [];
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return asRows(obj.rows);
    if (Array.isArray(obj.points)) return asRows(obj.points);
    return [];
  }, [result]);

  const metricValue = rows.length;

  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const data = await runEndpoint(formState as never);
      setResult(data);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 md:grid-cols-[320px_1fr]">
      <SidebarForm formState={formState} onFormChange={setFormState} onRun={onRun} running={running} />

      <section className="space-y-4">
        <div className="rounded border p-4">
          <h2 className="text-lg font-semibold">Metric</h2>
          <p className="mt-2 text-3xl font-bold">{metricValue}</p>
          <p className="text-sm text-gray-600">Rows returned</p>
        </div>

        {error ? <div className="rounded border border-red-400 bg-red-50 p-3 text-red-700">{error}</div> : null}

        <div className="rounded border p-4">
          <h2 className="mb-3 text-lg font-semibold">Table</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">No data yet. Click Run to fetch results.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {Object.keys(rows[0]).map((key) => (
                      <th key={key} className="border-b px-2 py-1 text-left">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.entries(row).map(([key, value]) => (
                        <td key={key} className="border-b px-2 py-1">{String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
`;
}

const LAYOUT_SOURCE = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const NEXT_CONFIG_SOURCE = `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;

const GLOBALS_CSS_SOURCE = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const POSTCSS_SOURCE = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const TAILWIND_SOURCE = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

const TS_CONFIG_SOURCE = `{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;

const NEXT_ENV_D_TS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited.
`;

export async function generateFrontendFromIr({ ir, outputDir }) {
  const frontendDir = path.resolve(outputDir, 'frontend');
  await fs.mkdir(path.join(frontendDir, 'app'), { recursive: true });
  await fs.mkdir(path.join(frontendDir, 'components'), { recursive: true });
  await fs.mkdir(path.join(frontendDir, 'lib'), { recursive: true });

  const packageJson = {
    name: 'generated-frontend',
    private: true,
    version: '0.0.1',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      next: '^14.2.0',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/node': '^20.17.0',
      '@types/react': '^18.3.11',
      '@types/react-dom': '^18.3.1',
      autoprefixer: '^10.4.20',
      postcss: '^8.4.47',
      tailwindcss: '^3.4.14',
      typescript: '^5.6.3',
    },
  };

  await fs.writeFile(path.join(frontendDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'app', 'layout.tsx'), LAYOUT_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'app', 'page.tsx'), renderPageSource(ir), 'utf8');
  await fs.writeFile(path.join(frontendDir, 'app', 'globals.css'), GLOBALS_CSS_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'components', 'SidebarForm.tsx'), renderSidebarComponent(ir), 'utf8');
  await fs.writeFile(path.join(frontendDir, 'lib', 'api.ts'), renderApiSource(ir), 'utf8');
  await fs.writeFile(path.join(frontendDir, 'next.config.mjs'), NEXT_CONFIG_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'postcss.config.js'), POSTCSS_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'tailwind.config.js'), TAILWIND_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'tsconfig.json'), TS_CONFIG_SOURCE, 'utf8');
  await fs.writeFile(path.join(frontendDir, 'next-env.d.ts'), NEXT_ENV_D_TS, 'utf8');

  return {
    frontend_dir: frontendDir,
    files: [
      'frontend/package.json',
      'frontend/app/layout.tsx',
      'frontend/app/page.tsx',
      'frontend/components/SidebarForm.tsx',
      'frontend/lib/api.ts',
      'frontend/tsconfig.json',
    ],
  };
}
