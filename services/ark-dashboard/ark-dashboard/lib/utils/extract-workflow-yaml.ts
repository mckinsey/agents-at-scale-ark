import yaml from 'js-yaml';

export type ExtractResult =
  | { ok: true; yaml: string }
  | { ok: false; reason: 'none' }
  | { ok: false; reason: 'invalid'; error: string };

interface FencedBlock {
  lang: string;
  content: string;
}

const FENCE_REGEX = /^[ \t]*```([^\n`]*)\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

function findFencedBlocks(message: string): FencedBlock[] {
  const normalized = message.replace(/\r\n/g, '\n');
  const blocks: FencedBlock[] = [];
  let match: RegExpExecArray | null;
  FENCE_REGEX.lastIndex = 0;
  while ((match = FENCE_REGEX.exec(normalized)) !== null) {
    blocks.push({
      lang: match[1].trim().toLowerCase(),
      content: match[2].replace(/\n$/, ''),
    });
  }
  return blocks;
}

function parseMapping(text: string): {
  valid: boolean;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = yaml.load(text);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    return { valid: false, error: errMessage };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'YAML content is not a mapping' };
  }

  return { valid: true };
}

export function extractWorkflowYaml(message: string): ExtractResult {
  if (!message) {
    return { ok: false, reason: 'none' };
  }

  const blocks = findFencedBlocks(message);
  if (blocks.length === 0) {
    return { ok: false, reason: 'none' };
  }

  const yamlBlocks = blocks.filter(
    block => block.lang === 'yaml' || block.lang === 'yml',
  );

  if (yamlBlocks.length === 0) {
    return { ok: false, reason: 'none' };
  }

  const block = yamlBlocks[yamlBlocks.length - 1];
  const result = parseMapping(block.content);
  if (!result.valid) {
    return {
      ok: false,
      reason: 'invalid',
      error: result.error ?? 'Invalid YAML',
    };
  }
  return { ok: true, yaml: block.content };
}
