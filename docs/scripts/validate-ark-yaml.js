#!/usr/bin/env node
/**
 * Validates every Ark-resource YAML block in docs/content (*.mdx) against the
 * CRD schemas in ark/config/crd/bases. Catches the kind of drift that breaks
 * `kubectl apply` (unknown fields, missing required fields, wrong types, bad
 * enums). Exits non-zero on any failure so it can gate CI.
 *
 *   node scripts/validate-ark-yaml.js [--quiet]
 *
 * Functions are exported for unit tests; main() only runs when invoked directly.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CRD_DIR = path.join(REPO_ROOT, 'ark', 'config', 'crd', 'bases');
const CONTENT_DIR = path.join(__dirname, '..', 'content');
const IGNORE_FILE = path.join(__dirname, 'validate-ark-yaml-ignore');
const ARK_GROUP = 'ark.mckinsey.com';

// k8s ObjectMeta and controller-written status aren't enumerated in CRD
// schemas, so docs examples routinely include fields like metadata.name that
// the schema doesn't list. We skip those two top-level keys.
const SKIP_TOP_LEVEL = new Set(['metadata', 'status']);

function loadIgnore(file = IGNORE_FILE) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, 'utf-8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean),
  );
}

function loadCrdSchemas(dir = CRD_DIR) {
  const schemas = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.yaml')) continue;
    const doc = yaml.load(fs.readFileSync(path.join(dir, file), 'utf-8'));
    if (!doc || doc.kind !== 'CustomResourceDefinition') continue;
    for (const v of doc.spec.versions || []) {
      schemas[`${doc.spec.group}/${v.name}/${doc.spec.names.kind}`] = v.schema?.openAPIV3Schema;
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

function extractYamlBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1) {
      if (/^\s*```ya?ml\s*$/.test(lines[i])) start = i;
    } else if (/^\s*```\s*$/.test(lines[i])) {
      blocks.push({startLine: start + 2, body: lines.slice(start + 1, i).join('\n')});
      start = -1;
    }
  }
  return blocks;
}

function parseDocs(body) {
  const docs = [];
  yaml.loadAll(body, (d) => d != null && docs.push(d));
  return docs;
}

function isArkResource(doc) {
  return !!doc && typeof doc === 'object' && typeof doc.apiVersion === 'string' && doc.apiVersion.startsWith(`${ARK_GROUP}/`);
}

function validateValue(value, schema, p, errors) {
  if (!schema || schema['x-kubernetes-preserve-unknown-fields'] || schema['x-kubernetes-int-or-string']) return;

  const t = schema.type || (schema.properties ? 'object' : null);
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

  if (t === 'object') {
    if (actual !== 'object') return errors.push(`${p.join('.')}: expected object, got ${actual}`);
    for (const r of schema.required || []) {
      if (!(r in value)) errors.push(`${p.join('.')}: missing required field "${r}"`);
    }
    const props = schema.properties || {};
    const additional = schema.additionalProperties;
    const isTop = p.length === 1;
    for (const key of Object.keys(value)) {
      if (isTop && SKIP_TOP_LEVEL.has(key)) continue;
      if (key in props) validateValue(value[key], props[key], [...p, key], errors);
      else if (additional && typeof additional === 'object') validateValue(value[key], additional, [...p, key], errors);
      else if (additional !== true) errors.push(`${p.join('.')}: unknown field "${key}"`);
    }
    return;
  }
  if (t === 'array') {
    if (actual !== 'array') return errors.push(`${p.join('.')}: expected array, got ${actual}`);
    if (schema.items) value.forEach((item, i) => validateValue(item, schema.items, [...p, `[${i}]`], errors));
    return;
  }
  if (t === 'string') {
    if (actual !== 'string') return errors.push(`${p.join('.')}: expected string, got ${actual}`);
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${p.join('.')}: "${value}" not in enum [${schema.enum.join(', ')}]`);
    }
    return;
  }
  if (t === 'integer' || t === 'number') {
    if (actual !== 'number') errors.push(`${p.join('.')}: expected number, got ${actual}`);
    return;
  }
  if (t === 'boolean') {
    if (actual !== 'boolean') errors.push(`${p.join('.')}: expected boolean, got ${actual}`);
  }
}

function validateDocAgainstSchemas(doc, schemas) {
  const [group, version] = doc.apiVersion.split('/');
  const key = `${group}/${version}/${doc.kind}`;
  const schema = schemas[key];
  if (!schema) return {key, missingSchema: true, errors: []};
  const errors = [];
  validateValue(doc, schema, [doc.kind], errors);
  const rule = CROSS_FIELD_RULES[doc.kind];
  if (rule) rule(doc, errors);
  return {key, missingSchema: false, errors};
}

// Mirror of webhook cross-field rules in ark/internal/validation/team.go.
// The CRD OpenAPI schema doesn't encode these, so the live API server rejects
// them at admission time even though the schema allows the shape. Keep this in
// sync with team.go when those rules change.
const CROSS_FIELD_RULES = {
  Team(doc, errors) {
    const spec = doc.spec || {};
    const strategy = spec.strategy;
    const hasMaxTurns = spec.maxTurns != null;
    const loopsEnabled = spec.loops === true;

    if (strategy === 'sequential') {
      if (loopsEnabled && !hasMaxTurns) errors.push('Team.spec: maxTurns is required when loops is enabled');
      if (!loopsEnabled && hasMaxTurns) errors.push('Team.spec: maxTurns can only be set when loops is enabled');
    } else if (strategy === 'selector') {
      if (loopsEnabled) errors.push("Team.spec: loops can only be used with the 'sequential' strategy");
      if (!hasMaxTurns) errors.push('Team.spec: selector strategy requires maxTurns to prevent infinite execution');
      if (!spec.selector || !spec.selector.agent) {
        errors.push('Team.spec: selector strategy requires selector.agent to be specified');
      }
    } else if (strategy === 'round-robin' || strategy === 'graph') {
      errors.push(`Team.spec.strategy: '${strategy}' is deprecated; rewrite as 'sequential'${strategy === 'round-robin' ? ' with loops: true' : ''}`);
    }
  },
};

function main() {
  const quiet = process.argv.includes('--quiet');
  const schemas = loadCrdSchemas();
  const ignore = loadIgnore();
  const files = walkMdx(CONTENT_DIR);
  const failures = [];
  let blocks = 0;
  let skipped = 0;

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    if (ignore.has(rel)) {
      skipped++;
      continue;
    }
    for (const {startLine, body} of extractYamlBlocks(fs.readFileSync(file, 'utf-8'))) {
      let docs;
      try {
        docs = parseDocs(body);
      } catch (err) {
        if (!body.includes('apiVersion:')) continue;
        const offset = err.mark?.line ?? 0;
        failures.push(`${rel}:${startLine + offset}: YAML parse error: ${err.reason || err.message}`);
        continue;
      }
      for (const doc of docs) {
        if (!isArkResource(doc)) continue;
        blocks++;
        const result = validateDocAgainstSchemas(doc, schemas);
        if (result.missingSchema) {
          failures.push(`${rel}:${startLine}: no CRD schema for ${result.key}`);
          continue;
        }
        for (const err of result.errors) failures.push(`${rel}:${startLine}: ${err}`);
      }
    }
  }

  const validated = files.length - skipped;
  if (failures.length > 0) {
    console.error('Ark YAML validation FAILED:');
    for (const f of failures) console.error(`  ${f}`);
    console.error(`\n${failures.length} error(s) across ${blocks} Ark resource block(s) in ${validated} validated files (${skipped} ignored)`);
    process.exit(1);
  }
  if (!quiet) {
    console.log(`Ark YAML validation OK (${blocks} resource block(s) across ${validated} validated files, ${skipped} ignored)`);
  }
}

module.exports = {
  loadIgnore,
  loadCrdSchemas,
  extractYamlBlocks,
  parseDocs,
  isArkResource,
  validateValue,
  validateDocAgainstSchemas,
  CROSS_FIELD_RULES,
  SKIP_TOP_LEVEL,
};

if (require.main === module) main();
