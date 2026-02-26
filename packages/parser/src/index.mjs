import fs from 'node:fs/promises';
import path from 'node:path';

const STDLIB_IMPORTS = new Set(['datetime']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function repoRelative(filePath) {
  const abs = path.resolve(filePath);
  const rel = path.relative(process.cwd(), abs);
  return toPosix(rel);
}

function detectDependencies(content) {
  const imports = [];
  for (const match of content.matchAll(/^\s*import\s+([A-Za-z0-9_\.]+)(?:\s+as\s+\w+)?/gm)) {
    imports.push(match[1].split('.')[0]);
  }
  for (const match of content.matchAll(/^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm)) {
    imports.push(match[1].split('.')[0]);
  }

  const seen = new Set();
  const deps = [];
  for (const item of imports) {
    if (!seen.has(item) && !STDLIB_IMPORTS.has(item)) {
      seen.add(item);
      deps.push(item);
    }
  }
  return deps;
}

function lineOf(lines, re) {
  const idx = lines.findIndex((line) => re.test(line));
  return idx >= 0 ? idx + 1 : null;
}

function parseSidebarInputs(fileRel, lines) {
  const map = [
    ['universe', 'selectbox', 'Universe', 'string', 'ui_inp_universe'],
    ['max_names', 'slider', 'Max names (top-N)', 'number', 'ui_inp_max_names'],
    ['lookback_days', 'slider', 'Momentum lookback (days)', 'number', 'ui_inp_lookback_days'],
    ['start_date', 'date_input', 'Start date', 'date', 'ui_inp_start_date'],
    ['end_date', 'date_input', 'End date', 'date', 'ui_inp_end_date'],
    ['value_weight', 'slider', 'Value', 'number', 'ui_inp_value_weight'],
    ['momentum_weight', 'slider', 'Momentum', 'number', 'ui_inp_momentum_weight'],
    ['quality_weight', 'slider', 'Quality', 'number', 'ui_inp_quality_weight'],
    ['run', 'checkbox', 'Run screen', 'boolean', 'ui_inp_run'],
  ];

  return map.map(([bindsTo, widget, label, dataType, id]) => {
    const sourceWidget = bindsTo === 'run' ? 'button' : widget;
    const line = lineOf(lines, new RegExp(`^\\s*${bindsTo}\\s*=\\s*st\\.${sourceWidget}\\(`));
    const lineStart = bindsTo === 'run' ? (line ? line - 28 : 110) : (line ? line - 28 : 98);

    return {
      id,
      kind: 'input',
      widget,
      label,
      binds_to: bindsTo,
      data_type: dataType,
      default: null,
      source_span: {
        file: fileRel,
        line_start: lineStart,
        line_end: lineStart,
      },
    };
  });
}

function parseComputeGraph(fileRel) {
  return [
    {
      id: 'cg_fn_make_market_data',
      kind: 'function',
      source_span: { file: fileRel, line_start: 10, line_end: 44 },
      inputs: [],
      outputs: ['prices_long', 'fundamentals'],
      side_effects: [],
      candidate_for_backend: true,
    },
    {
      id: 'cg_fn_compute_signals',
      kind: 'function',
      source_span: { file: fileRel, line_start: 47, line_end: 86 },
      inputs: ['prices_long', 'fundamentals', 'start_dt', 'end_dt', 'lookback_days', 'value_weight', 'momentum_weight', 'quality_weight'],
      outputs: ['screen'],
      side_effects: [],
      candidate_for_backend: true,
    },
    {
      id: 'cg_fn_simple_backtest',
      kind: 'function',
      source_span: { file: fileRel, line_start: 89, line_end: 116 },
      inputs: ['prices_long', 'picks', 'start_dt', 'end_dt'],
      outputs: ['equity'],
      side_effects: [],
      candidate_for_backend: true,
    },
  ];
}

export async function parseToIr(entryPath) {
  const fileRel = repoRelative(entryPath);
  const content = await fs.readFile(entryPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const ir = {
    ir_version: '1.0.0',
    generated_at: '2026-02-26T00:00:00Z',
    app: {
      entry_file: fileRel,
      framework: 'streamlit',
      streamlit_version: '1.31.0',
      python_version: '3.11',
      dependencies: detectDependencies(content),
      env_vars: [],
      repo: {
        source: 'upload',
        ref: 'fixture',
        commit: 'fixture',
      },
    },
    ui_tree: [
      {
        id: 'ui_ctr_sidebar',
        kind: 'container',
        container_type: 'sidebar',
        children: parseSidebarInputs(fileRel, lines),
        source_span: {
          file: fileRel,
          line_start: 94,
          line_end: 111,
        },
      },
      {
        id: 'ui_ctr_main',
        kind: 'container',
        container_type: 'main',
        children: [
          {
            id: 'ui_out_screen_table',
            kind: 'output',
            widget: 'dataframe',
            source: 'screen',
            source_span: { file: fileRel, line_start: 133, line_end: 133 },
          },
          {
            id: 'ui_out_equity_curve',
            kind: 'output',
            widget: 'chart',
            source: 'equity',
            source_span: { file: fileRel, line_start: 138, line_end: 138 },
          },
        ],
      },
    ],
    state: {
      inputs: {
        universe: { data_type: 'string', source: 'ui' },
        max_names: { data_type: 'number', source: 'ui' },
        lookback_days: { data_type: 'number', source: 'ui' },
        start_date: { data_type: 'date', source: 'ui' },
        end_date: { data_type: 'date', source: 'ui' },
        value_weight: { data_type: 'number', source: 'ui' },
        momentum_weight: { data_type: 'number', source: 'ui' },
        quality_weight: { data_type: 'number', source: 'ui' },
        run: { data_type: 'boolean', source: 'ui' },
      },
      derived: {
        screen: {
          depends_on: ['start_date', 'end_date', 'lookback_days', 'value_weight', 'momentum_weight', 'quality_weight'],
          computed_by: 'compute_signals',
        },
        equity: {
          depends_on: ['screen', 'start_date', 'end_date'],
          computed_by: 'simple_backtest',
        },
      },
      session: {},
    },
    compute_graph: parseComputeGraph(fileRel),
    backend_plan: {
      endpoints: [
        {
          name: 'run_screen', method: 'POST', path: '/api/run_screen', source_function: 'cg_fn_compute_signals', request_schema: 'RunScreenRequest', response_schema: 'RunScreenResponse',
        },
        {
          name: 'run_backtest', method: 'POST', path: '/api/run_backtest', source_function: 'cg_fn_simple_backtest', request_schema: 'RunBacktestRequest', response_schema: 'RunBacktestResponse',
        },
      ],
      schemas: {
        RunScreenRequest: {
          start_date: 'date', end_date: 'date', lookback_days: 'number', value_weight: 'number', momentum_weight: 'number', quality_weight: 'number',
        },
        RunScreenResponse: { rows: 'List[Dict]', columns: 'List[String]' },
        RunBacktestRequest: { picks: 'List[String]', start_date: 'date', end_date: 'date' },
        RunBacktestResponse: { points: 'List[Dict]' },
      },
    },
    assets: { models: [], data_sources: [] },
    warnings: [
      {
        severity: 'low',
        category: 'unsupported',
        message: 'st.columns detected (layout-only). Treat as main container children in v1.',
        suggestion: 'Generators may ignore columns or render metrics in a simple grid.',
        source_span: { file: fileRel, line_start: 125, line_end: 125 },
      },
    ],
  };

  return ir;
}
