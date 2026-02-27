import fs from 'node:fs/promises';
import path from 'node:path';

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return fallback;
}

function parseType(typeName) {
  const raw = String(typeName || '').trim();
  if (/^list\s*\[(.*)\]$/i.test(raw)) {
    const inner = raw.match(/^list\s*\[(.*)\]$/i)?.[1] || 'string';
    return { kind: 'array', item: parseType(inner) };
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'date') return { kind: 'date' };
  if (normalized === 'number' || normalized === 'int' || normalized === 'float') return { kind: 'number' };
  if (normalized === 'boolean' || normalized === 'bool') return { kind: 'boolean' };
  if (normalized === 'dict' || normalized === 'object') return { kind: 'object' };
  if (normalized === 'string') return { kind: 'string' };

  return { kind: 'unknown', raw };
}

function zodExpr(node) {
  if (node.kind === 'array') return `z.array(${zodExpr(node.item)})`;
  if (node.kind === 'date') return "z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'expected YYYY-MM-DD')";
  if (node.kind === 'number') return 'z.number()';
  if (node.kind === 'boolean') return 'z.boolean()';
  if (node.kind === 'object') return 'z.record(z.unknown())';
  if (node.kind === 'string') return 'z.string()';
  return `z.unknown().describe(${JSON.stringify(`Unsupported IR type: ${node.raw || ''}`)})`;
}

function stubValueExpr(node) {
  if (node.kind === 'array') return '[]';
  if (node.kind === 'date') return "'1970-01-01'";
  if (node.kind === 'number') return '0';
  if (node.kind === 'boolean') return 'false';
  if (node.kind === 'object') return '{}';
  if (node.kind === 'string') return "''";
  return 'null';
}

function createSchemaLines(schemaName, schemaDef) {
  const entries = Object.entries(asObject(schemaDef));
  if (!entries.length) {
    return `const ${schemaName} = z.object({}).strict();`;
  }
  const fields = entries
    .map(([field, fieldType]) => `  ${JSON.stringify(field)}: ${zodExpr(parseType(fieldType))}`)
    .join(',\n');
  return `const ${schemaName} = z.object({\n${fields}\n}).strict();`;
}

function createStubObjectExpr(schemaDef) {
  const entries = Object.entries(asObject(schemaDef));
  if (!entries.length) return '{}';
  const body = entries
    .map(([field, fieldType]) => `    ${JSON.stringify(field)}: ${stubValueExpr(parseType(fieldType))}`)
    .join(',\n');
  return `{\n${body}\n  }`;
}

function endpointHandlerLine(endpoint, schemas) {
  const requestSchema = endpoint.request_schema;
  const responseSchema = endpoint.response_schema;
  const responseDef = schemas[responseSchema] || {};
  return `app.route({
    method: ${JSON.stringify(String(endpoint.method || 'POST').toUpperCase())},
    url: ${JSON.stringify(String(endpoint.path || '/api/todo'))},
    handler: async (request, reply) => {
      const requestValidation = ${requestSchema}.safeParse(request.body ?? {});
      if (!requestValidation.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          endpoint: ${JSON.stringify(String(endpoint.name || 'generated_endpoint'))},
          issues: requestValidation.error.issues,
        });
      }

      const serviceResult = await computeService(${JSON.stringify(String(endpoint.source_function || 'unknown_function'))}, requestValidation.data);
      const candidateResponse = {
        ...${createStubObjectExpr(responseDef)},
        ...(serviceResult && typeof serviceResult === 'object' ? serviceResult : {}),
      };

      const responseValidation = ${responseSchema}.safeParse(candidateResponse);
      if (!responseValidation.success) {
        request.log.error({ issues: responseValidation.error.issues }, 'Generated backend produced response that does not match schema');
        return reply.code(500).send({ error: 'invalid_response_shape' });
      }

      return reply.code(200).send(responseValidation.data);
    },
  });`;
}

function renderServerSource(ir) {
  const backendPlan = asObject(ir.backend_plan);
  const schemas = asObject(backendPlan.schemas);
  const endpoints = Array.isArray(backendPlan.endpoints) ? backendPlan.endpoints : [];
  const schemaDecls = Object.keys(schemas).map((name) => createSchemaLines(name, schemas[name])).join('\n\n');
  const endpointDecls = endpoints.length
    ? endpoints.map((endpoint) => endpointHandlerLine(endpoint, schemas)).join('\n\n')
    : "app.get('/api/todo', async () => ({ ok: true, todo: 'No endpoints were defined in IR backend_plan.endpoints.' }));";

  return `import Fastify from './fastify-lite.mjs';
import { z } from './zod-lite.mjs';
import { computeService } from './services.mjs';

${schemaDecls || '// No schemas were defined in backend_plan.schemas.'}

const app = Fastify({ logger: true });
app.get('/health', async () => ({ ok: true }));

${endpointDecls}

const port = Number(process.env.PORT || 3411);
const host = process.env.HOST || '0.0.0.0';
app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
`;
}

function renderServicesSource(ir) {
  const nodes = Array.isArray(ir.compute_graph) ? ir.compute_graph : [];
  const names = [...new Set(nodes.filter((node) => node && typeof node.id === 'string').map((node) => node.id))];
  const mapRows = names.map((name) => `  ${JSON.stringify(name)}: async (_payload) => ({ /* TODO: implement ${name} */ }),`).join('\n');

  return `const handlers = {
${mapRows || '  // No compute graph handlers in IR.'}
};

export async function computeService(sourceFunction, payload) {
  const handler = handlers[sourceFunction];
  if (!handler) return {};
  return handler(payload);
}
`;
}

const FASTIFY_LITE = `import http from 'node:http';

export default function Fastify() {
  const routes = [];

  const app = {
    log: {
      error: (...args) => console.error(...args),
      info: (...args) => console.log(...args),
    },
    get(url, handler) {
      routes.push({ method: 'GET', url, handler });
    },
    route(def) {
      routes.push({ method: String(def.method || 'GET').toUpperCase(), url: def.url, handler: def.handler });
    },
    async listen({ port, host }) {
      const server = http.createServer(async (req, res) => {
        const match = routes.find((route) => route.method === req.method && route.url === req.url);
        if (!match) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }

        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let body = undefined;
        if (rawBody) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = undefined;
          }
        }

        const reply = {
          _status: 200,
          code(status) {
            this._status = status;
            return this;
          },
          send(payload) {
            res.statusCode = this._status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(payload));
          },
        };

        const request = { method: req.method, url: req.url, body, log: app.log };
        const output = await match.handler(request, reply);
        if (!res.writableEnded) {
          reply.send(output);
        }
      });

      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return server;
    },
  };

  return app;
}
`;

const ZOD_LITE = `function result(ok, value, issues) {
  if (ok) return { success: true, data: value };
  return { success: false, error: { issues } };
}

class ZodType {
  constructor(validateFn) {
    this.validateFn = validateFn;
  }
  safeParse(value) {
    return this.validateFn(value, '$');
  }
  describe() {
    return this;
  }
}

function issue(path, message) {
  return [{ path, message }];
}

function validateShape(shape, strict) {
  return new ZodType((value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return result(false, null, issue(path, 'Expected object'));
    }

    const out = {};
    for (const [key, schema] of Object.entries(shape)) {
      const parsed = schema.validateFn(value[key], path + '.' + key);
      if (!parsed.success) return parsed;
      out[key] = parsed.data;
    }

    if (strict) {
      const unknownKeys = Object.keys(value).filter((key) => !(key in shape));
      if (unknownKeys.length) {
        return result(false, null, issue(path, 'Unexpected keys: ' + unknownKeys.join(', ')));
      }
    }

    return result(true, out, []);
  });
}

export const z = {
  string() {
    const api = new ZodType((value, path) => typeof value === 'string' ? result(true, value, []) : result(false, null, issue(path, 'Expected string')));
    api.regex = (re, message) => new ZodType((value, path) => {
      const parsed = api.validateFn(value, path);
      if (!parsed.success) return parsed;
      return re.test(value) ? parsed : result(false, null, issue(path, message || 'Invalid format'));
    });
    return api;
  },
  number() {
    return new ZodType((value, path) => Number.isFinite(value) ? result(true, value, []) : result(false, null, issue(path, 'Expected number')));
  },
  boolean() {
    return new ZodType((value, path) => typeof value === 'boolean' ? result(true, value, []) : result(false, null, issue(path, 'Expected boolean')));
  },
  unknown() {
    return new ZodType((value) => result(true, value, []));
  },
  array(item) {
    return new ZodType((value, path) => {
      if (!Array.isArray(value)) return result(false, null, issue(path, 'Expected array'));
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        const parsed = item.validateFn(value[i], path + '[' + i + ']');
        if (!parsed.success) return parsed;
        out.push(parsed.data);
      }
      return result(true, out, []);
    });
  },
  record(item) {
    return new ZodType((value, path) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return result(false, null, issue(path, 'Expected object record'));
      }
      for (const [key, val] of Object.entries(value)) {
        const parsed = item.validateFn(val, path + '.' + key);
        if (!parsed.success) return parsed;
      }
      return result(true, value, []);
    });
  },
  object(shape) {
    const base = validateShape(shape, false);
    base.strict = () => validateShape(shape, true);
    return base;
  },
};
`;

export async function generateBackendFromIr({ ir, outputDir }) {
  const backendDir = path.resolve(outputDir, 'backend');
  const srcDir = path.join(backendDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  const packageJson = {
    name: 'generated-backend',
    private: true,
    version: '0.0.1',
    type: 'module',
    scripts: {
      build: 'node --check src/server.mjs',
      start: 'node src/server.mjs',
    },
  };

  await fs.writeFile(path.join(backendDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(srcDir, 'fastify-lite.mjs'), FASTIFY_LITE, 'utf8');
  await fs.writeFile(path.join(srcDir, 'zod-lite.mjs'), ZOD_LITE, 'utf8');
  await fs.writeFile(path.join(srcDir, 'services.mjs'), renderServicesSource(ir), 'utf8');
  await fs.writeFile(path.join(srcDir, 'server.mjs'), renderServerSource(ir), 'utf8');

  return {
    backend_dir: backendDir,
    files: [
      'backend/package.json',
      'backend/src/server.mjs',
      'backend/src/services.mjs',
      'backend/src/fastify-lite.mjs',
      'backend/src/zod-lite.mjs',
    ],
  };
}
