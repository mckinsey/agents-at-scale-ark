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

const fs = require('node:fs');
const path = require('node:path');
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

function stripComment(line) {
  const i = line.indexOf('#');
  return (i === -1 ? line : line.slice(0, i)).trim();
}

function loadIgnore(file = IGNORE_FILE) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf-8').split('\n').map(stripComment).filter(Boolean));
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

function actualType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function pushTypeError(p, expected, got, errors) {
  errors.push(`${p.join('.')}: expected ${expected}, got ${got}`);
}

function validateObject(value, schema, p, errors) {
  const actual = actualType(value);
  if (actual !== 'object') return pushTypeError(p, 'object', actual, errors);
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
}

function validateArray(value, schema, p, errors) {
  const actual = actualType(value);
  if (actual !== 'array') return pushTypeError(p, 'array', actual, errors);
  if (!schema.items) return;
  value.forEach((item, i) => validateValue(item, schema.items, [...p, `[${i}]`], errors));
}

function validateString(value, schema, p, errors) {
  const actual = actualType(value);
  if (actual !== 'string') return pushTypeError(p, 'string', actual, errors);
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${p.join('.')}: "${value}" not in enum [${schema.enum.join(', ')}]`);
  }
}

function validateNumber(value, _schema, p, errors) {
  const actual = actualType(value);
  if (actual !== 'number') pushTypeError(p, 'number', actual, errors);
}

function validateBoolean(value, _schema, p, errors) {
  const actual = actualType(value);
  if (actual !== 'boolean') pushTypeError(p, 'boolean', actual, errors);
}

const TYPE_VALIDATORS = {
  object: validateObject,
  array: validateArray,
  string: validateString,
  integer: validateNumber,
  number: validateNumber,
  boolean: validateBoolean,
};

function validateValue(value, schema, p, errors) {
  if (!schema) return;
  if (schema['x-kubernetes-preserve-unknown-fields']) return;
  if (schema['x-kubernetes-int-or-string']) return;
  const type = schema.type || (schema.properties ? 'object' : null);
  const handler = TYPE_VALIDATORS[type];
  if (handler) handler(value, schema, p, errors);
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

function validateSequentialTeam(spec, errors) {
  const hasMaxTurns = spec.maxTurns != null;
  const loopsEnabled = spec.loops === true;
  if (loopsEnabled && !hasMaxTurns) errors.push('Team.spec: maxTurns is required when loops is enabled');
  if (!loopsEnabled && hasMaxTurns) errors.push('Team.spec: maxTurns can only be set when loops is enabled');
}

function validateSelectorTeam(spec, errors) {
  if (spec.loops === true) errors.push("Team.spec: loops can only be used with the 'sequential' strategy");
  if (spec.maxTurns == null) errors.push('Team.spec: selector strategy requires maxTurns to prevent infinite execution');
  if (!spec.selector || !spec.selector.agent) {
    errors.push('Team.spec: selector strategy requires selector.agent to be specified');
  }
}

const DEPRECATED_TEAM_STRATEGY_HINT = {
  'round-robin': "rewrite as 'sequential' with loops: true",
  graph: "rewrite as 'sequential'",
};

const TEAM_STRATEGY_RULES = {
  sequential: validateSequentialTeam,
  selector: validateSelectorTeam,
};

const CROSS_FIELD_RULES = {
  Team(doc, errors) {
    const spec = doc.spec || {};
    const rule = TEAM_STRATEGY_RULES[spec.strategy];
    if (rule) return rule(spec, errors);
    const hint = DEPRECATED_TEAM_STRATEGY_HINT[spec.strategy];
    if (hint) errors.push(`Team.spec.strategy: '${spec.strategy}' is deprecated; ${hint}`);
  },
};

function processBlock(rel, startLine, body, schemas, failures) {
  let docs;
  try {
    docs = parseDocs(body);
  } catch (err) {
    if (!body.includes('apiVersion:')) return 0;
    const offset = err.mark?.line ?? 0;
    failures.push(`${rel}:${startLine + offset}: YAML parse error: ${err.reason || err.message}`);
    return 0;
  }
  let blocks = 0;
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
  return blocks;
}

function processFile(file, schemas, failures) {
  const rel = path.relative(REPO_ROOT, file);
  let blocks = 0;
  for (const {startLine, body} of extractYamlBlocks(fs.readFileSync(file, 'utf-8'))) {
    blocks += processBlock(rel, startLine, body, schemas, failures);
  }
  return blocks;
}

function reportResults({failures, blocks, validated, skipped, quiet}) {
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

function main() {
  const quiet = process.argv.includes('--quiet');
  const schemas = loadCrdSchemas();
  const ignore = loadIgnore();
  const files = walkMdx(CONTENT_DIR);
  const failures = [];
  let blocks = 0;
  let skipped = 0;

  for (const file of files) {
    if (ignore.has(path.relative(REPO_ROOT, file))) {
      skipped++;
      continue;
    }
    blocks += processFile(file, schemas, failures);
  }

  reportResults({failures, blocks, validated: files.length - skipped, skipped, quiet});
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
