import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const FIXTURE_DIR = "fixtures/streamlit_hf_equity_screener";
const EXPECTED_IR = path.join(FIXTURE_DIR, "expected/ir.json");

// Where the parser should write IR for comparison.
// Keep this out of git via .gitignore (scripts/ will write into fixtures/**/generated/)
const GENERATED_DIR = path.join(FIXTURE_DIR, "generated");
const GENERATED_IR = path.join(GENERATED_DIR, "ir.json");

// ---- helpers ----
function fail(msg) {
  console.error(`validate-fixture: FAIL: ${msg}`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Canonical JSON stringify: stable object key order + 2-space indent
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = canonicalize(value[k]);
    }
    return out;
  }
  return value;
}

function canonicalStringify(obj) {
  return JSON.stringify(canonicalize(obj), null, 2) + "\n";
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// ---- main ----
if (!fs.existsSync(EXPECTED_IR)) {
  fail(`missing expected IR at ${EXPECTED_IR}`);
}

ensureDir(GENERATED_DIR);

// 1) Generate IR from fixture.
// You have two options:
//
// Option A (preferred): call your CLI once it exists:
//   npm run st2stack -- parse --entry fixtures/.../app.py --out fixtures/.../generated/ir.json
//
// Option B (temporary): if CLI not built yet, this step should fail loudly,
// forcing Codex to implement it as part of Milestone 2.
//
const CLI_CMD = process.env.ST2STACK_CLI_CMD;

// If you don't set ST2STACK_CLI_CMD, we'll try a conventional default.
const cmd = CLI_CMD ?? "node";
const args =
  CLI_CMD
    ? CLI_CMD.split(" ").slice(1)
    : ["cli/dist/index.js", "parse", "--entry", path.join(FIXTURE_DIR, "app.py"), "--out", GENERATED_IR];

const res = spawnSync(cmd, args, { stdio: "inherit" });

if (res.status !== 0) {
  fail(
    `IR generation command failed. Set ST2STACK_CLI_CMD or implement CLI parse.\n` +
    `Tried: ${cmd} ${args.join(" ")}`
  );
}

// 2) Read and canonicalize both JSONs
if (!fs.existsSync(GENERATED_IR)) {
  fail(`generated IR not found at ${GENERATED_IR}`);
}

const expected = readJson(EXPECTED_IR);
const generated = readJson(GENERATED_IR);

const expectedStr = canonicalStringify(expected);
const generatedStr = canonicalStringify(generated);

// 3) Compare hashes (fast)
const eh = sha256(expectedStr);
const gh = sha256(generatedStr);

if (eh !== gh) {
  // Write canonicalized versions to help diff in PRs
  const expectedCanon = path.join(FIXTURE_DIR, "generated/expected.canon.ir.json");
  const generatedCanon = path.join(FIXTURE_DIR, "generated/generated.canon.ir.json");
  fs.writeFileSync(expectedCanon, expectedStr, "utf8");
  fs.writeFileSync(generatedCanon, generatedStr, "utf8");

  fail(
    `IR mismatch.\n` +
    `Expected hash: ${eh}\n` +
    `Generated hash: ${gh}\n` +
    `Wrote canonical files for diff:\n` +
    `  ${expectedCanon}\n` +
    `  ${generatedCanon}`
  );
}

console.log("validate-fixture: OK (IR matches expected).");
process.exit(0);