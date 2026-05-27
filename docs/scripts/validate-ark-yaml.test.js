import {describe, it, expect, beforeAll} from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const {
  loadIgnore,
  loadCrdSchemas,
  extractYamlBlocks,
  parseDocs,
  isArkResource,
  validateValue,
  validateDocAgainstSchemas,
  CROSS_FIELD_RULES,
  SKIP_TOP_LEVEL,
} = require('./validate-ark-yaml.js');

describe('extractYamlBlocks', () => {
  it('captures fenced yaml and yml blocks', () => {
    const text = [
      '# heading',
      '```yaml',
      'a: 1',
      '```',
      'prose',
      '```yml',
      'b: 2',
      '```',
    ].join('\n');
    const blocks = extractYamlBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({startLine: 3, body: 'a: 1'});
    expect(blocks[1]).toMatchObject({startLine: 7, body: 'b: 2'});
  });

  it('ignores non-yaml fences', () => {
    const text = '```bash\necho hi\n```\n```yaml\nx: 1\n```\n';
    expect(extractYamlBlocks(text)).toHaveLength(1);
  });

  it('returns nothing for a file without code fences', () => {
    expect(extractYamlBlocks('# title\n\njust prose\n')).toEqual([]);
  });
});

describe('parseDocs', () => {
  it('returns multiple docs from a --- separated body', () => {
    const docs = parseDocs('a: 1\n---\nb: 2\n');
    expect(docs).toEqual([{a: 1}, {b: 2}]);
  });

  it('skips empty docs', () => {
    expect(parseDocs('---\na: 1\n---\n')).toEqual([{a: 1}]);
  });

  it('throws on malformed yaml', () => {
    expect(() => parseDocs('a: 1\n  bad: indent\n')).toThrow();
  });
});

describe('isArkResource', () => {
  it('accepts an Ark resource', () => {
    expect(isArkResource({apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Agent'})).toBe(true);
  });

  it('rejects non-Ark and malformed docs', () => {
    expect(isArkResource({apiVersion: 'v1', kind: 'ConfigMap'})).toBe(false);
    expect(isArkResource(null)).toBe(false);
    expect(isArkResource('string')).toBeFalsy();
    expect(isArkResource({kind: 'Agent'})).toBe(false);
  });
});

describe('loadIgnore', () => {
  it('returns an empty set when the file does not exist', () => {
    expect(loadIgnore(path.join(os.tmpdir(), 'no-such-ignore-file'))).toEqual(new Set());
  });

  it('strips comments and blanks', () => {
    const tmp = path.join(os.tmpdir(), `ignore-${Date.now()}.txt`);
    fs.writeFileSync(tmp, '# header comment\n\ndocs/a.mdx\ndocs/b.mdx # inline\n');
    try {
      expect(loadIgnore(tmp)).toEqual(new Set(['docs/a.mdx', 'docs/b.mdx']));
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe('validateValue', () => {
  const objectSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: {type: 'string'},
      count: {type: 'integer'},
      type: {type: 'string', enum: ['agent', 'team']},
    },
  };

  it('passes a well-formed value', () => {
    const errs = [];
    validateValue({name: 'x', count: 1, type: 'agent'}, objectSchema, ['Root'], errs);
    expect(errs).toEqual([]);
  });

  it('reports missing required fields', () => {
    const errs = [];
    validateValue({count: 1}, objectSchema, ['Root'], errs);
    expect(errs).toContain('Root: missing required field "name"');
  });

  it('reports unknown fields', () => {
    const errs = [];
    validateValue({name: 'x', bogus: true}, objectSchema, ['Root'], errs);
    expect(errs).toContain('Root: unknown field "bogus"');
  });

  it('reports enum violations', () => {
    const errs = [];
    validateValue({name: 'x', type: 'model'}, objectSchema, ['Root'], errs);
    expect(errs.some((e) => e.includes('not in enum'))).toBe(true);
  });

  it('reports type mismatches', () => {
    const errs = [];
    validateValue({name: 'x', count: 'three'}, objectSchema, ['Root'], errs);
    expect(errs).toContain('Root.count: expected number, got string');
  });

  it('skips metadata and status at the top level', () => {
    const errs = [];
    validateValue(
      {name: 'x', metadata: {name: 'whatever', extra: 1}, status: {phase: 'done'}},
      objectSchema,
      ['Root'],
      errs,
    );
    expect(errs).toEqual([]);
  });

  it('still validates metadata when nested deeper', () => {
    const nested = {
      type: 'object',
      properties: {child: {type: 'object', properties: {metadata: {type: 'string'}}}},
    };
    const errs = [];
    validateValue({child: {metadata: 7}}, nested, ['Root'], errs);
    expect(errs).toContain('Root.child.metadata: expected string, got number');
  });

  it('respects x-kubernetes-preserve-unknown-fields', () => {
    const errs = [];
    validateValue({anything: 'goes'}, {type: 'object', 'x-kubernetes-preserve-unknown-fields': true}, ['Root'], errs);
    expect(errs).toEqual([]);
  });

  it('validates arrays element-by-element', () => {
    const arrSchema = {type: 'array', items: {type: 'object', required: ['name'], properties: {name: {type: 'string'}}}};
    const errs = [];
    validateValue([{name: 'a'}, {other: 1}], arrSchema, ['List'], errs);
    expect(errs).toContain('List.[1]: missing required field "name"');
    expect(errs).toContain('List.[1]: unknown field "other"');
  });
});

describe('validateDocAgainstSchemas', () => {
  const schemas = {
    'ark.mckinsey.com/v1alpha1/Agent': {
      type: 'object',
      required: ['spec'],
      properties: {
        apiVersion: {type: 'string'},
        kind: {type: 'string'},
        spec: {
          type: 'object',
          required: ['modelRef'],
          properties: {modelRef: {type: 'object', required: ['name'], properties: {name: {type: 'string'}}}},
        },
      },
    },
  };

  it('returns no errors for a valid Agent', () => {
    const result = validateDocAgainstSchemas(
      {apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Agent', metadata: {name: 'a'}, spec: {modelRef: {name: 'default'}}},
      schemas,
    );
    expect(result.missingSchema).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('flags a schema lookup miss', () => {
    const result = validateDocAgainstSchemas(
      {apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Unknown', spec: {}},
      schemas,
    );
    expect(result.missingSchema).toBe(true);
  });

  it('reports a spec mismatch', () => {
    const result = validateDocAgainstSchemas(
      {apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Agent', spec: {modelRef: {}}},
      schemas,
    );
    expect(result.errors.some((e) => e.includes('missing required field "name"'))).toBe(true);
  });
});

describe('loadCrdSchemas (live)', () => {
  let schemas;
  beforeAll(() => {
    schemas = loadCrdSchemas();
  });

  it('finds at least the Agent, Team, and Query schemas', () => {
    expect(schemas['ark.mckinsey.com/v1alpha1/Agent']).toBeDefined();
    expect(schemas['ark.mckinsey.com/v1alpha1/Team']).toBeDefined();
    expect(schemas['ark.mckinsey.com/v1alpha1/Query']).toBeDefined();
  });
});

describe('SKIP_TOP_LEVEL', () => {
  it('includes the two top-level keys we never validate', () => {
    expect(SKIP_TOP_LEVEL.has('metadata')).toBe(true);
    expect(SKIP_TOP_LEVEL.has('status')).toBe(true);
    expect(SKIP_TOP_LEVEL.has('spec')).toBe(false);
  });
});

describe('CROSS_FIELD_RULES.Team', () => {
  const Team = (spec) => ({apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Team', spec});
  const run = (spec) => {
    const errs = [];
    CROSS_FIELD_RULES.Team(Team(spec), errs);
    return errs;
  };

  it('accepts plain sequential with no loops and no maxTurns', () => {
    expect(run({strategy: 'sequential', members: []})).toEqual([]);
  });

  it('accepts sequential with both loops and maxTurns', () => {
    expect(run({strategy: 'sequential', loops: true, maxTurns: 5, members: []})).toEqual([]);
  });

  it('rejects sequential with loops but no maxTurns', () => {
    expect(run({strategy: 'sequential', loops: true, members: []})).toContain(
      'Team.spec: maxTurns is required when loops is enabled',
    );
  });

  it('rejects sequential with maxTurns but no loops', () => {
    expect(run({strategy: 'sequential', maxTurns: 5, members: []})).toContain(
      'Team.spec: maxTurns can only be set when loops is enabled',
    );
  });

  it('accepts selector with maxTurns + selector.agent', () => {
    expect(run({strategy: 'selector', maxTurns: 10, selector: {agent: 'planner'}, members: []})).toEqual([]);
  });

  it('rejects selector without maxTurns', () => {
    expect(run({strategy: 'selector', selector: {agent: 'planner'}, members: []})).toContain(
      'Team.spec: selector strategy requires maxTurns to prevent infinite execution',
    );
  });

  it('rejects selector with loops', () => {
    expect(
      run({strategy: 'selector', maxTurns: 10, loops: true, selector: {agent: 'planner'}, members: []}),
    ).toContain("Team.spec: loops can only be used with the 'sequential' strategy");
  });

  it('rejects selector without selector.agent', () => {
    expect(run({strategy: 'selector', maxTurns: 10, members: []})).toContain(
      'Team.spec: selector strategy requires selector.agent to be specified',
    );
    expect(run({strategy: 'selector', maxTurns: 10, selector: {}, members: []})).toContain(
      'Team.spec: selector strategy requires selector.agent to be specified',
    );
  });

  it('flags round-robin as deprecated', () => {
    expect(run({strategy: 'round-robin', members: []})[0]).toContain("'round-robin' is deprecated");
  });

  it('flags graph as deprecated', () => {
    expect(run({strategy: 'graph', members: []})[0]).toContain("'graph' is deprecated");
  });
});

describe('validateDocAgainstSchemas with cross-field rules', () => {
  const teamSchema = {
    type: 'object',
    properties: {
      apiVersion: {type: 'string'},
      kind: {type: 'string'},
      spec: {
        type: 'object',
        properties: {
          strategy: {type: 'string'},
          loops: {type: 'boolean'},
          maxTurns: {type: 'integer'},
          members: {type: 'array', items: {type: 'object'}},
          selector: {type: 'object', properties: {agent: {type: 'string'}}},
        },
      },
    },
  };

  it('layers cross-field rules on top of schema validation', () => {
    const result = validateDocAgainstSchemas(
      {apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Team', spec: {strategy: 'sequential', maxTurns: 5, members: []}},
      {'ark.mckinsey.com/v1alpha1/Team': teamSchema},
    );
    expect(result.errors).toContain('Team.spec: maxTurns can only be set when loops is enabled');
  });
});
