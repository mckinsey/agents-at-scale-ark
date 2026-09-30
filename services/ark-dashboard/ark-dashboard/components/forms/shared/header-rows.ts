'use client';

import { useState } from 'react';

export type HeaderData = {
  key: string;
  name: string;
  type: 'direct' | 'secret';
  value: string;
};

export type HeaderError = { nameError?: string; valueError?: string };

export const EMPTY_HEADER_ROW: HeaderData = {
  key: 'row-1',
  name: '',
  type: 'direct',
  value: '',
};

export function generateUniqueKey() {
  const randomValue = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const generatedSuffix = randomValue % 100000;
  return `row-${Date.now()}-${generatedSuffix}`;
}

export function validateHeaders(headers: HeaderData[]): {
  errors: Record<string, HeaderError>;
  hasErrors: boolean;
  nonEmptyHeaders: HeaderData[];
} {
  const nonEmptyHeaders = headers.filter(
    row => row.name.trim() !== '' || row.value.trim() !== '',
  );

  const errors: Record<string, HeaderError> = {};
  let hasErrors = false;
  nonEmptyHeaders.forEach(header => {
    const headerError: HeaderError = {};
    if (header.name.trim() === '') {
      headerError.nameError = 'Header name is required';
      hasErrors = true;
    }
    if (header.value.trim() === '') {
      headerError.valueError = 'Header value is required';
      hasErrors = true;
    }
    if (headerError.nameError || headerError.valueError) {
      errors[header.key] = headerError;
    }
  });

  return { errors, hasErrors, nonEmptyHeaders };
}

export function useHeaderRows(initial: HeaderData[] = [EMPTY_HEADER_ROW]) {
  const [headers, setHeaders] = useState<HeaderData[]>(initial);
  const [headerErrors, setHeaderErrors] = useState<Record<string, HeaderError>>(
    {},
  );

  const updateRow = (index: number, updated: Partial<HeaderData>) => {
    setHeaders(prev =>
      prev.map((row, i) => (i === index ? { ...row, ...updated } : row)),
    );
  };

  const addRow = () => {
    setHeaders(prev => [
      ...prev,
      { key: generateUniqueKey(), name: '', type: 'direct', value: '' },
    ]);
  };

  const deleteRow = (key: string) => {
    setHeaders(prev => prev.filter(header => header.key !== key));
    setHeaderErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearRowError = (key: string, updated: Partial<HeaderData>) => {
    setHeaderErrors(prev => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      if (updated.name !== undefined && next[key].nameError) {
        delete next[key].nameError;
        if (!next[key].valueError) delete next[key];
      }
      if (updated.value !== undefined && next[key]?.valueError) {
        delete next[key].valueError;
        if (!next[key]?.nameError) delete next[key];
      }
      return next;
    });
  };

  const validate = (): HeaderData[] | null => {
    const { errors, hasErrors, nonEmptyHeaders } = validateHeaders(headers);
    setHeaderErrors(errors);
    return hasErrors ? null : nonEmptyHeaders;
  };

  return {
    headers,
    setHeaders,
    headerErrors,
    setHeaderErrors,
    updateRow,
    addRow,
    deleteRow,
    clearRowError,
    validate,
  };
}

export type HeaderRows = ReturnType<typeof useHeaderRows>;
