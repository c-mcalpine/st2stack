import fs from 'node:fs/promises';
import path from 'node:path';

const WIDGET_METHODS = [
  'set_page_config',
  'title',
  'header',
  'subheader',
  'selectbox',
  'multiselect',
  'slider',
  'text_input',
  'number_input',
  'date_input',
  'checkbox',
  'button',
  'form',
  'columns',
  'metric',
  'dataframe',
  'table',
  'line_chart',
  'bar_chart',
  'info',
];

function collectInOrder(matches) {
  const seen = new Set();
  const ordered = [];

  for (const item of matches) {
    if (!seen.has(item)) {
      seen.add(item);
      ordered.push(item);
    }
  }

  return ordered;
}

function detectImports(content) {
  const imports = [];

  for (const match of content.matchAll(/^\s*import\s+([A-Za-z0-9_\.]+)(?:\s+as\s+\w+)?/gm)) {
    imports.push(match[1].split('.')[0]);
  }

  for (const match of content.matchAll(/^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm)) {
    imports.push(match[1].split('.')[0]);
  }

  return collectInOrder(imports);
}

function detectEnvVars(content) {
  const envVars = [];

  for (const match of content.matchAll(/os\.getenv\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]/g)) {
    envVars.push(match[1]);
  }

  for (const match of content.matchAll(/os\.environ\[\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]\s*\]/g)) {
    envVars.push(match[1]);
  }

  for (const match of content.matchAll(/os\.environ\.get\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]/g)) {
    envVars.push(match[1]);
  }

  return collectInOrder(envVars);
}

function detectSessionStateKeys(content) {
  const keys = [];

  for (const match of content.matchAll(/st\.session_state\[\s*['\"]([^'\"]+)['\"]\s*\]/g)) {
    keys.push(match[1]);
  }

  for (const match of content.matchAll(/st\.session_state\.get\(\s*['\"]([^'\"]+)['\"]/g)) {
    keys.push(match[1]);
  }

  return collectInOrder(keys);
}

function detectFilesReferenced(content) {
  const candidates = [];

  for (const match of content.matchAll(/['\"]([^'\"]+\.(?:csv|json|parquet|pkl|pt|onnx|txt|yaml|yml))['\"]/gi)) {
    candidates.push(match[1]);
  }

  return collectInOrder(candidates);
}

function detectWidgets(content) {
  const widgets = [];

  const sidebarIndex = content.indexOf('st.sidebar');
  if (sidebarIndex >= 0) {
    widgets.push({ method: 'sidebar', index: sidebarIndex });
  }

  for (const method of WIDGET_METHODS) {
    const regex = new RegExp(`\\bst\\.${method}\\s*\\(`, 'g');
    const firstMatch = content.search(regex);

    if (firstMatch >= 0) {
      widgets.push({ method, index: firstMatch });
    }
  }

  for (const match of content.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\.metric\s*\(/g)) {
    widgets.push({ method: 'metric', index: match.index ?? 0 });
  }

  const ordered = widgets
    .sort((a, b) => a.index - b.index)
    .map((item) => item.method);

  return collectInOrder(ordered);
}

function detectUnsupported(content) {
  const unsupported = [];

  if (/\bst\.columns\s*\(/.test(content)) {
    unsupported.push({
      feature: 'st.columns',
      severity: 'low',
      note: 'Layout-only; can be treated as main container children in v1.',
    });
  }

  return unsupported;
}

export function scanStreamlitSource({ content, entryFile }) {
  return {
    scan_version: '1.0.0',
    entry_file: entryFile,
    framework: 'streamlit',
    imports: detectImports(content),
    env_vars: detectEnvVars(content),
    streamlit_widgets: detectWidgets(content),
    session_state_keys: detectSessionStateKeys(content),
    files_referenced: detectFilesReferenced(content),
    unsupported_detected: detectUnsupported(content),
  };
}

export async function scanFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return scanStreamlitSource({ content, entryFile: path.basename(filePath) });
}
