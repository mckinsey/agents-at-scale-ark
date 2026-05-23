#!/usr/bin/env node
/**
 * Validates every Ark-resource YAML block in docs/content/**\/*.mdx against the
 * CRD schemas in ark/config/crd/bases. Catches the kind of drift that breaks
 * `kubectl apply` (unknown fields, missing required fields, wrong types, bad enums).
 *
 * Run with: node scripts/validate-ark-yaml.js
 * Exits non-zero on any failure so it can gate CI.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CRD_DIR = path.join(REPO_ROOT, 'ark', 'config', 'crd', 'bases');
const CONTENT_DIR = path.join(__dirname, '..', 'content');
const IGNORE_FILE = path.join(__dirname, 'validate-ark-yaml-ignore');
const ARK_GROUP = 'ark.mckinsey.com';

function loadIgnore() {
  if (!fs.existsSync(IGNORE_FILE)) return new Set();
  return new Set(
    fs.readFileSync(IGNORE_FILE, 'utf-8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean),
  );
}

function loadCrdSchemas() {
  const schemas = {};
  for (const file of fs.readdirSync(CRD_DIR)) {
    if (!file.endsWith('.yaml')) continue;
    const doc = yaml.load(fs.readFileSync(path.join(CRD_DIR, file), 'utf-8'));
    if (!doc || doc.kind !== 'CustomResourceDefinition') continue;
    const group = doc.spec.group;
    const kind = doc.spec.names.kind;
    for (const v of doc.spec.versions || []) {
      const key = `${group}/${v.name}/${kind}`;
      schemas[key] = v.schema && v.schema.openAPIV3Schema;
    }
  }
  return schemas;
}

function walkMdx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMdx(full, out);
    else if (entry.isFile() && entry.name.endsWith('.mdx')) out.push(full);
  }
  return out;
}

function extractYamlBlocks(file) {
  const text = fs.readFileSync(file, 'utf-8');
  const lines = text.split('\n');
  const blocks = [];
  let inBlock = false;
  let blockStart = 0;
  let blockLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      const m = /^\s*```(ya?ml)\s*$/.exec(line);
      if (m) {
        inBlock = true;
        blockStart = i + 1;
        blockLines = [];
      }
    } else {
      if (/^\s*```\s*$/.test(line)) {
        blocks.push({startLine: blockStart + 1, body: blockLines.join('\n')});
        inBlock = false;
      } else {
        blockLines.push(line);
      }
    }
  }
  return blocks;
}

function parseMultiDoc(body) {
  const docs = [];
  try {
    yaml.loadAll(body, (d) => {
      if (d !== null && d !== undefined) docs.push(d);
    });
  } catch (err) {
    return {error: err.message};
  }
  return {docs};
}

// k8s strict-decoder behavior: any field not in the schema is rejected.
// `metadata` (ObjectMeta) and `status` (controller-written) are skipped: their
// schemas in CRDs typically just say `{type: object}` and don't enumerate the
// built-in k8s fields users routinely include in docs examples.
const SKIP_TOP_LEVEL = new Set(['metadata', 'status']);

function validateAgainstSchema(value, schema, pathParts, errors) {
  if (!schema) return;
  if (schema['x-kubernetes-preserve-unknown-fields']) return;
  if (schema['x-kubernetes-int-or-string']) return;

  const oneOf = schema.oneOf || schema.anyOf;
  if (Array.isArray(oneOf)) {
    let matched = false;
    for (const sub of oneOf) {
      const trial = [];
      validateAgainstSchema(value, {...schema, oneOf: undefined, anyOf: undefined, ...sub}, pathParts, trial);
      if (trial.length === 0) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      errors.push(`${pathParts.join('.')}: value does not satisfy any allowed shape`);
    }
    return;
  }

  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${pathParts.join('.')}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return;
    }
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const r of required) {
      if (!(r in value)) {
        errors.push(`${pathParts.join('.')}: missing required field "${r}"`);
      }
    }
    const additional = schema.additionalProperties;
    const isTopLevel = pathParts.length === 1;
    for (const key of Object.keys(value)) {
      if (isTopLevel && SKIP_TOP_LEVEL.has(key)) continue;
      if (key in props) {
        validateAgainstSchema(value[key], props[key], [...pathParts, key], errors);
      } else if (additional && typeof additional === 'object') {
        validateAgainstSchema(value[key], additional, [...pathParts, key], errors);
      } else if (additional === true) {
        // permissive
      } else {
        errors.push(`${pathParts.join('.')}: unknown field "${key}"`);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${pathParts.join('.')}: expected array, got ${typeof value}`);
      return;
    }
    if (schema.items) {
      value.forEach((item, idx) =>
        validateAgainstSchema(item, schema.items, [...pathParts, `[${idx}]`], errors),
      );
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${pathParts.join('.')}: expected string, got ${typeof value}`);
      return;
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${pathParts.join('.')}: "${value}" not in enum [${schema.enum.join(', ')}]`);
    }
    return;
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number') {
      errors.push(`${pathParts.join('.')}: expected number, got ${typeof value}`);
    }
    return;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${pathParts.join('.')}: expected boolean, got ${typeof value}`);
    }
    return;
  }
}

function isArkResource(doc) {
  return doc && typeof doc === 'object' && typeof doc.apiVersion === 'string' && doc.apiVersion.startsWith(`${ARK_GROUP}/`);
}

function main() {
  const schemas = loadCrdSchemas();
  const ignore = loadIgnore();
  const files = walkMdx(CONTENT_DIR);
  let totalBlocks = 0;
  let totalErrors = 0;
  let skipped = 0;
  const failures = [];

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    if (ignore.has(rel)) {
      skipped++;
      continue;
    }
    for (const {startLine, body} of extractYamlBlocks(file)) {
      const parsed = parseMultiDoc(body);
      if (parsed.error) {
        if (!body.includes('apiVersion:')) continue;
        failures.push(`${rel}:${startLine}: YAML parse error: ${parsed.error}`);
        totalErrors++;
        continue;
      }
      for (const doc of parsed.docs) {
        if (!isArkResource(doc)) continue;
        totalBlocks++;
        const [group, version] = doc.apiVersion.split('/');
        const key = `${group}/${version}/${doc.kind}`;
        const schema = schemas[key];
        if (!schema) {
          failures.push(`${rel}:${startLine}: no CRD schema for ${key}`);
          totalErrors++;
          continue;
        }
        const errors = [];
        validateAgainstSchema(doc, schema, [doc.kind], errors);
        for (const err of errors) {
          failures.push(`${rel}:${startLine}: ${err}`);
          totalErrors++;
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Ark YAML validation FAILED:');
    for (const f of failures) console.error(`  ${f}`);
    console.error(`\n${totalErrors} error(s) across ${totalBlocks} Ark resource block(s) in ${files.length - skipped} validated files (${skipped} ignored)`);
    process.exit(1);
  }
  console.log(`Ark YAML validation OK (${totalBlocks} resource block(s) across ${files.length - skipped} validated files, ${skipped} ignored)`);
}

main();
