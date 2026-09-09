import { describe, expect, it } from 'vitest';

import {
  LABEL_MAX_LENGTH,
  labelSchema,
  validateLabelDraft,
} from '@/components/forms/fields/label-validation';

describe('labelSchema', () => {
  it('accepts a simple alphanumeric label', () => {
    expect(labelSchema.safeParse('mcp').success).toBe(true);
  });

  it("accepts '-', '_' and '.' in the middle of a label", () => {
    expect(labelSchema.safeParse('mcp-servers_v1.0').success).toBe(true);
  });

  it('rejects an empty label', () => {
    expect(labelSchema.safeParse('').success).toBe(false);
  });

  it(`rejects a label longer than ${LABEL_MAX_LENGTH} characters`, () => {
    expect(labelSchema.safeParse('a'.repeat(LABEL_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  it('accepts a label exactly at the max length', () => {
    expect(labelSchema.safeParse('a'.repeat(LABEL_MAX_LENGTH)).success).toBe(
      true,
    );
  });

  it('rejects a label containing spaces', () => {
    expect(labelSchema.safeParse('mcp servers').success).toBe(false);
  });

  it("rejects a label starting with '-'", () => {
    expect(labelSchema.safeParse('-mcp').success).toBe(false);
  });

  it("rejects a label ending with '.'", () => {
    expect(labelSchema.safeParse('mcp.').success).toBe(false);
  });
});

describe('validateLabelDraft', () => {
  it('returns null for an empty draft', () => {
    expect(validateLabelDraft('', [])).toBeNull();
  });

  it('returns null for a whitespace-only draft', () => {
    expect(validateLabelDraft('   ', [])).toBeNull();
  });

  it('returns null for a valid, non-duplicate label', () => {
    expect(validateLabelDraft('mcp', [])).toBeNull();
  });

  it('flags a duplicate label', () => {
    expect(validateLabelDraft('mcp', ['mcp'])).toMatch(/already been added/);
  });

  it('flags an invalid label', () => {
    expect(validateLabelDraft('mcp servers', [])).toMatch(
      /starting and ending with a letter or digit/,
    );
  });

  it('trims the draft before checking for duplicates', () => {
    expect(validateLabelDraft('  mcp  ', ['mcp'])).toMatch(
      /already been added/,
    );
  });
});
