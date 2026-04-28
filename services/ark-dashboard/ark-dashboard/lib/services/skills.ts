/**
 * Mock skills service backed by localStorage.
 * Mirrors the shape proposed in openspec/changes/agent-skills/specs/agent-skills/spec.md:
 * a Claude-Code-shaped file bundle keyed by relative path, with SKILL.md as the
 * single source of truth — its frontmatter carries the description, its body
 * carries the instructions, and any fenced code block whose info-string includes
 * `name=<filename>` is extracted as a script.
 *
 * Replace with a real API client once the Skill CRD ships.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Types + runtime constants
 * ───────────────────────────────────────────────────────────────────────── */

export const SCRIPT_EXTENSION_ALLOWLIST = [
  '.sh',
  '.py',
  '.js',
  '.ts',
  '.rb',
] as const;

export interface Skill {
  name: string;
  /**
   * Map of relative path → file contents. Mirrors the on-disk skill layout
   * Claude Code uses: SKILL.md (required), scripts/*, plus arbitrary
   * reference files (templates/, docs/, etc.).
   */
  files: Record<string, string>;
  /** Paths to skip during script discovery (still mounted). */
  toolsExclude?: string[];
  /** Paths to expose as tools even though they're outside scripts/. */
  toolsInclude?: string[];
  preload?: boolean;
  keepWarm?: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'ark-dashboard:skills:default';
const SEED_VERSION_KEY = 'ark-dashboard:skills:seed-version';
const SEED_VERSION = '3';

/* ─────────────────────────────────────────────────────────────────────────
 * Parser helpers — frontmatter + fenced-script extraction
 * ───────────────────────────────────────────────────────────────────────── */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

export interface ParsedSkillMd {
  description: string;
  body: string;
  rawFrontmatter: string;
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { description: '', body: content, rawFrontmatter: '' };
  }
  const rawFrontmatter = match[1];
  const body = match[2] ?? '';
  // Tiny, intentionally-not-a-full-yaml-parser frontmatter scan: pulls
  // simple `key: value` lines on the top level. Good enough for the mockup.
  let description = '';
  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+?)\s*$/.exec(line);
    if (m && m[1] === 'description') {
      description = m[2].replace(/^["']|["']$/g, '');
      break;
    }
  }
  return { description, body, rawFrontmatter };
}

const FENCE_RE = /^(```|~~~)([^\n]*)\n([\s\S]*?)\n\1\s*$/gm;
const NAME_ATTR_RE = /\bname=("([^"]+)"|'([^']+)'|(\S+))/;

export interface ExtractedScript {
  path: string;
  content: string;
}

/**
 * Walks a SKILL.md document and extracts every fenced code block whose
 * info-string contains a `name=<filename>` attribute. Each match becomes a
 * file at `scripts/<filename>` (or kept verbatim if the name already has a
 * slash).
 */
export function extractFencedScripts(skillMd: string): ExtractedScript[] {
  const out: ExtractedScript[] = [];
  const seen = new Set<string>();
  for (const match of skillMd.matchAll(FENCE_RE)) {
    const info = match[2] ?? '';
    const content = match[3] ?? '';
    const nameMatch = NAME_ATTR_RE.exec(info);
    if (!nameMatch) continue;
    const rawName = nameMatch[2] ?? nameMatch[3] ?? nameMatch[4] ?? '';
    if (!rawName) continue;
    const path = rawName.includes('/') ? rawName : `scripts/${rawName}`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, content });
  }
  return out;
}

/**
 * Take a single SKILL.md text input and produce the storage-shape `files`
 * map: SKILL.md verbatim plus any extracted scripts at their resolved paths.
 * Reference files (templates/, docs/, etc.) that the caller wants to
 * preserve can be passed via `keepFiles` and they will be merged in.
 */
export function buildFilesFromSkillMd(
  skillMd: string,
  keepFiles?: Record<string, string>,
): Record<string, string> {
  const files: Record<string, string> = { 'SKILL.md': skillMd };
  if (keepFiles) {
    for (const [path, content] of Object.entries(keepFiles)) {
      if (path === 'SKILL.md') continue;
      // Don't preserve old extracted scripts — the SKILL.md is now
      // authoritative, so they would be a stale duplicate.
      if (path.startsWith('scripts/')) continue;
      files[path] = content;
    }
  }
  for (const { path, content } of extractFencedScripts(skillMd)) {
    files[path] = content;
  }
  return files;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Seed data — full SKILL.md documents with inline `name=…` fenced scripts
 * ───────────────────────────────────────────────────────────────────────── */

const COBOL_SKILL_MD = `---
description: Analyse a COBOL file and draft a Python rewrite
---

When analysing a COBOL program:

- Run \`extract-copybooks\` first to pull out COPY statements.
- Then run \`structure-summary\` to map paragraphs → sections.
- Never attempt conversion without showing the structure first.
- Surface unfamiliar COBOL constructs to the user before guessing semantics.

\`\`\`bash name=extract-copybooks.sh
#!/usr/bin/env bash
grep -iE '^ +COPY ' "$1" | awk '{print $2}' | sort -u
\`\`\`

\`\`\`python name=structure-summary.py
import re, sys
src = open(sys.argv[1]).read()
# Map paragraphs to sections — ~20 lines of analysis here.
print("structure summary placeholder")
\`\`\`
`;

const CSV_SKILL_MD = `---
description: Summarise a CSV file — column types, row count, basic stats
---

Use \`summarise\` with the file path as its first argument. Always show
the column-type inference before any aggregate stats.

\`\`\`python name=summarise.py
import pandas as pd, sys
df = pd.read_csv(sys.argv[1])
print(df.dtypes)
print(df.describe())
\`\`\`
`;

const RUNBOOK_SKILL_MD = `---
description: Respond to paging-tier alerts per runbook §3
---

Always run \`triage\` first. Do not page anyone until that returns a green
status. If triage exits non-zero, escalate per §3.2.

\`\`\`bash name=triage.sh
#!/usr/bin/env bash
set -e
echo "running triage…"
# real runbook commands here
\`\`\`
`;

function makeSeed(
  name: string,
  skillMd: string,
  createdAt: string,
): Skill {
  return {
    name,
    files: buildFilesFromSkillMd(skillMd),
    createdAt,
    updatedAt: createdAt,
  };
}

function buildSeed(): Skill[] {
  return [
    makeSeed('cobol-migrator', COBOL_SKILL_MD, '2026-04-22T08:00:00Z'),
    makeSeed('csv-summary', CSV_SKILL_MD, '2026-04-22T09:00:00Z'),
    makeSeed('incident-runbook', RUNBOOK_SKILL_MD, '2026-04-22T10:00:00Z'),
  ];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Storage I/O — reseeds when the on-disk shape or seed version drifts
 * ───────────────────────────────────────────────────────────────────────── */

function isCurrentShape(value: unknown): value is Skill {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    !('runtime' in v) &&
    !!v.files &&
    typeof v.files === 'object'
  );
}

function writeSeed(): Skill[] {
  const seed = buildSeed();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
    } catch {
      // ignore quota / disabled storage
    }
  }
  return seed;
}

function read(): Skill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const storedSeedVersion = window.localStorage.getItem(SEED_VERSION_KEY);
    if (!raw || storedSeedVersion !== SEED_VERSION) return writeSeed();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isCurrentShape)) {
      return writeSeed();
    }
    return parsed;
  } catch {
    return writeSeed();
  }
}

function write(skills: Skill[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
  } catch {
    // Quota exceeded or storage disabled — silently drop.
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Derived helpers — description, instructions, script discovery
 * ───────────────────────────────────────────────────────────────────────── */

export function getDescription(skill: Skill): string {
  const md = skill.files?.['SKILL.md'];
  if (!md) return '';
  return parseSkillMd(md).description;
}

export function getInstructions(skill: Skill): string {
  const md = skill.files?.['SKILL.md'];
  if (!md) return '';
  return parseSkillMd(md).body.trim();
}

const SHEBANG_RE = /^#!/;

function hasAllowedExtension(path: string): boolean {
  return SCRIPT_EXTENSION_ALLOWLIST.some(ext => path.endsWith(ext));
}

function passesShebangOrExtension(path: string, content: string): boolean {
  if (hasAllowedExtension(path)) return true;
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  return SHEBANG_RE.test(firstLine);
}

export interface DiscoveredScript {
  /** Path inside the bundle, e.g. `scripts/extract-copybooks.sh`. */
  path: string;
  /** Tool name as it would land on the model: `<skill>_<basename>`. */
  toolName: string;
  /** True if this entry was added by `tools.include` despite an unusual path. */
  forcedInclude: boolean;
}

function basenameWithoutExtension(path: string): string {
  const last = path.split('/').pop() ?? path;
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

export function discoverScripts(skill: Skill): DiscoveredScript[] {
  if (!skill.files) return [];
  const exclude = new Set(skill.toolsExclude ?? []);
  const include = new Set(skill.toolsInclude ?? []);
  const result: DiscoveredScript[] = [];
  for (const [path, content] of Object.entries(skill.files)) {
    if (path === 'SKILL.md') continue;
    if (exclude.has(path)) continue;
    const segments = path.split('/');
    const inScriptsDir = segments.length === 2 && segments[0] === 'scripts';
    const forcedInclude = include.has(path);
    if (!inScriptsDir && !forcedInclude) continue;
    if (!passesShebangOrExtension(path, content)) continue;
    const toolName = `${skill.name}_${basenameWithoutExtension(path)}`;
    result.push({ path, toolName, forcedInclude });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

/* ─────────────────────────────────────────────────────────────────────────
 * CRUD
 * ───────────────────────────────────────────────────────────────────────── */

export const skillsService = {
  async list(): Promise<Skill[]> {
    return read();
  },

  async getByName(name: string): Promise<Skill | null> {
    return read().find(s => s.name === name) ?? null;
  },

  async create(
    skill: Omit<Skill, 'createdAt' | 'updatedAt'>,
  ): Promise<Skill> {
    const skills = read();
    if (skills.some(s => s.name === skill.name)) {
      throw new Error(`A skill named "${skill.name}" already exists`);
    }
    if (!skill.files['SKILL.md']) {
      throw new Error(
        'SKILL.md is required (it carries the skill description and instructions).',
      );
    }
    const now = new Date().toISOString();
    const next: Skill = { ...skill, createdAt: now, updatedAt: now };
    write([...skills, next]);
    return next;
  },

  async update(
    name: string,
    patch: Partial<Omit<Skill, 'name' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Skill> {
    const skills = read();
    const index = skills.findIndex(s => s.name === name);
    if (index < 0) throw new Error(`Skill "${name}" not found`);
    const merged: Skill = {
      ...skills[index],
      ...patch,
      // Preserve identity + timestamps that aren't being patched.
      name: skills[index].name,
      createdAt: skills[index].createdAt,
      updatedAt: new Date().toISOString(),
    };
    if (!merged.files['SKILL.md']) {
      throw new Error('SKILL.md is required.');
    }
    const next = [...skills];
    next[index] = merged;
    write(next);
    return merged;
  },

  async delete(name: string): Promise<void> {
    write(read().filter(s => s.name !== name));
  },

  async resetSeed(): Promise<void> {
    writeSeed();
  },
};
