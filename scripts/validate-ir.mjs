#!/usr/bin/env node
/**
 * Validates sample IR (and optionally other IR files) against schema/ir.schema.json.
 * Exit 0 if valid, non-zero and stderr message if invalid.
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const schemaPath = join(root, "schema", "ir.schema.json");
const samplePath = join(root, "schema", "sample-ir.json");

const schemaRaw = JSON.parse(readFileSync(schemaPath, "utf-8"));
const data = JSON.parse(readFileSync(samplePath, "utf-8"));
// Strip $schema so Ajv does not try to resolve draft/2020-12 (schema is draft-07 compatible)
const { $schema, ...schema } = schemaRaw;

const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(data);
if (valid) {
  console.log("validate-ir: schema/ir.schema.json OK for schema/sample-ir.json");
  process.exit(0);
} else {
  console.error("validate-ir: validation failed:");
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
