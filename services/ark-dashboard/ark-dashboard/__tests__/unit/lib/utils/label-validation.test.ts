import { describe, expect, it } from 'vitest';

import {
  LABEL_ERROR_MESSAGE,
  getLabelError,
  isValidLabel,
  labelsSchema,
} from '@/lib/utils/label-validation';

describe('isValidLabel', () => {
  it('accepts alphanumeric labels', () => {
    expect(isValidLabel('prod')).toBe(true);
    expect(isValidLabel('Prod')).toBe(true);
    expect(isValidLabel('env2')).toBe(true);
    expect(isValidLabel('2024')).toBe(true);
  });

  it('rejects labels with spaces, hyphens or symbols', () => {
    expect(isValidLabel('my label')).toBe(false);
    expect(isValidLabel('my-label')).toBe(false);
    expect(isValidLabel('my_label')).toBe(false);
    expect(isValidLabel('label!')).toBe(false);
    expect(isValidLabel('my.label')).toBe(false);
  });

  it('rejects empty labels', () => {
    expect(isValidLabel('')).toBe(false);
  });

  it('rejects labels longer than 63 characters', () => {
    expect(isValidLabel('a'.repeat(63))).toBe(true);
    expect(isValidLabel('a'.repeat(64))).toBe(false);
  });
});

describe('getLabelError', () => {
  it('returns null for valid labels', () => {
    expect(getLabelError('production')).toBe(null);
  });

  it('returns the alphanumeric message for invalid characters', () => {
    expect(getLabelError('my label')).toBe(LABEL_ERROR_MESSAGE);
    expect(getLabelError('my-label')).toBe(LABEL_ERROR_MESSAGE);
  });

  it('returns a message for empty labels', () => {
    expect(getLabelError('')).toBe('Label cannot be empty');
  });

  it('returns a message for labels that are too long', () => {
    expect(getLabelError('a'.repeat(64))).toBe(
      'Label must be 63 characters or less',
    );
  });
});

describe('labelsSchema', () => {
  it('accepts an empty list because labels are optional', () => {
    expect(labelsSchema.safeParse([]).success).toBe(true);
  });

  it('accepts multiple labels', () => {
    expect(labelsSchema.safeParse(['prod', 'eu', 'v2']).success).toBe(true);
  });

  it('rejects a list containing an invalid label', () => {
    expect(labelsSchema.safeParse(['prod', 'not valid']).success).toBe(false);
  });
});
