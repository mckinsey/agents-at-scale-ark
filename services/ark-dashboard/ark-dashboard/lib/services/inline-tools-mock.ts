/**
 * Mock service for inline Tools backed by localStorage.
 *
 * The dashboard's real `toolsService` (lib/services/tools.ts) talks to
 * /api/v1/tools and the underlying Tool CRD currently has type enum
 * {http,mcp,agent,team,builtin}. Inline tools live in this separate
 * mock layer until the operator side of the inline-tools change lands
 * — see openspec/changes/inline-tools/.
 *
 * Replace with calls into the real toolsService once `type: inline`
 * is accepted by the API. The shape exported here is deliberately the
 * shape we expect from the API: a Tool with an `inline` sub-object
 * containing source + optional language.
 */

import { trackEvent } from '@/lib/analytics/singleton';
import type { Tool } from './tools';

export type InlineToolLanguage = 'bash' | 'python' | 'node' | 'ts';

export const INLINE_LANGUAGES: ReadonlyArray<InlineToolLanguage> = [
  'bash',
  'python',
  'node',
  'ts',
];

export interface InlineToolSpec {
  source: string;
  language?: InlineToolLanguage;
}

export interface InlineTool extends Tool {
  type: 'inline';
  description: string;
  inline: InlineToolSpec;
  inputSchema?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InlineToolCreateInput {
  name: string;
  description: string;
  inline: InlineToolSpec;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, string>;
}

const STORAGE_KEY = 'ark-dashboard:inline-tools:default';
const SEED_VERSION_KEY = 'ark-dashboard:inline-tools:seed-version';
const SEED_VERSION = '1';

const SHEBANG_PREFIX = '#!';

export function inferLanguageFromSource(
  source: string,
): InlineToolLanguage | undefined {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.startsWith(SHEBANG_PREFIX)) return undefined;
  if (firstLine.includes('python')) return 'python';
  if (firstLine.includes('node')) return 'node';
  if (firstLine.includes('tsx')) return 'ts';
  if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
  return undefined;
}

export function effectiveLanguage(
  tool: Pick<InlineTool, 'inline'>,
): InlineToolLanguage {
  if (tool.inline.language) return tool.inline.language;
  const inferred = inferLanguageFromSource(tool.inline.source);
  return inferred ?? 'bash';
}

const SEED_CSV_SUMMARY: InlineToolCreateInput = {
  name: 'csv-summarise',
  description: 'Summarise a CSV file — column types, row count, basic stats',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the CSV file inside the runner pod',
      },
    },
    required: ['file'],
  },
  inline: {
    language: 'python',
    source: `#!/usr/bin/env python
import sys, json
import pandas as pd

args = json.loads(sys.argv[1])
df = pd.read_csv(args["file"])
print(df.dtypes.to_json())
print(df.describe().to_json())
`,
  },
};

const SEED_RUNBOOK_TRIAGE: InlineToolCreateInput = {
  name: 'runbook-triage',
  description: 'Run incident triage per runbook §3 and return a status code',
  inputSchema: {
    type: 'object',
    properties: {
      alert_id: { type: 'string', description: 'The alert identifier' },
    },
    required: ['alert_id'],
  },
  inline: {
    language: 'bash',
    source: `#!/usr/bin/env bash
set -euo pipefail
ALERT_ID=$(jq -r .alert_id <<< "$1")
echo "triaging $ALERT_ID..."
# real runbook commands would live here
echo "{\\"status\\":\\"green\\"}"
`,
  },
};

const SEED_PAYLOAD_VALIDATOR: InlineToolCreateInput = {
  name: 'payload-validator',
  description: 'Validate a JSON payload against a known schema',
  inputSchema: {
    type: 'object',
    properties: {
      payload: { type: 'object', description: 'The JSON payload to validate' },
    },
    required: ['payload'],
  },
  inline: {
    language: 'node',
    source: `const args = JSON.parse(process.argv[2]);
const payload = args.payload;
const errors = [];
if (typeof payload.id !== 'string') errors.push('id must be string');
if (typeof payload.amount !== 'number') errors.push('amount must be number');
process.stdout.write(JSON.stringify({ valid: errors.length === 0, errors }));
`,
  },
};

function buildSeed(): InlineTool[] {
  const stamp = '2026-05-11T08:00:00.000Z';
  return [
    SEED_CSV_SUMMARY,
    SEED_RUNBOOK_TRIAGE,
    SEED_PAYLOAD_VALIDATOR,
  ].map((spec, index) => ({
    id: spec.name,
    name: spec.name,
    type: 'inline' as const,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    inline: spec.inline,
    createdAt: stamp,
    updatedAt: stamp,
    labels: { 'ark.mckinsey.com/seed-index': String(index) },
  }));
}

function isInlineToolRecord(value: unknown): value is InlineTool {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type !== 'inline') return false;
  if (typeof record.name !== 'string') return false;
  const inline = record.inline as Record<string, unknown> | undefined;
  if (!inline || typeof inline !== 'object') return false;
  return typeof inline.source === 'string';
}

function writeSeed(): InlineTool[] {
  const seed = buildSeed();
  if (typeof window === 'undefined') return seed;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
  } catch {
    // quota or disabled storage — silently fall through
  }
  return seed;
}

function read(): InlineTool[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const storedSeedVersion = window.localStorage.getItem(SEED_VERSION_KEY);
    if (!raw || storedSeedVersion !== SEED_VERSION) return writeSeed();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isInlineToolRecord)) {
      return writeSeed();
    }
    return parsed;
  } catch {
    return writeSeed();
  }
}

function write(tools: InlineTool[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch {
    // quota or disabled storage — silently fall through
  }
}

export const inlineToolsMockService = {
  async getAll(): Promise<InlineTool[]> {
    return read();
  },

  async getByName(name: string): Promise<InlineTool | null> {
    return read().find(tool => tool.name === name) ?? null;
  },

  async create(input: InlineToolCreateInput): Promise<InlineTool> {
    const tools = read();
    if (tools.some(tool => tool.name === input.name)) {
      throw new Error(`A tool named "${input.name}" already exists`);
    }
    if (!input.inline.source.trim()) {
      throw new Error('Inline source is required');
    }
    const now = new Date().toISOString();
    const next: InlineTool = {
      id: input.name,
      name: input.name,
      type: 'inline',
      description: input.description,
      inputSchema: input.inputSchema,
      annotations: input.annotations,
      inline: input.inline,
      createdAt: now,
      updatedAt: now,
    };
    write([...tools, next]);
    trackEvent({
      name: 'tool_created',
      properties: {
        toolName: input.name,
        toolType: 'inline',
        inlineLanguage:
          input.inline.language ?? inferLanguageFromSource(input.inline.source),
      },
    });
    return next;
  },

  async delete(name: string): Promise<void> {
    write(read().filter(tool => tool.name !== name));
    trackEvent({
      name: 'tool_deleted',
      properties: { toolName: name },
    });
  },

  async resetSeed(): Promise<void> {
    writeSeed();
  },
};
