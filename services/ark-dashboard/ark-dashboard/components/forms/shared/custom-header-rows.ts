'use client';

import { useCallback, useState } from 'react';

import type { AgentHeader } from '@/lib/services';

import {
  EMPTY_HEADER_ROW,
  type HeaderData,
  type HeaderError,
  generateUniqueKey,
  useHeaderRows,
  validateHeaders,
} from './header-rows';

const DEFAULT_SECRET_KEY = 'token';

type CustomHeadersValidation = {
  errors: Record<string, HeaderError>;
  hasErrors: boolean;
  headers: AgentHeader[];
};

function isEditableHeader(header: AgentHeader): boolean {
  return !header.value.valueFrom || !!header.value.valueFrom.secretKeyRef;
}

export function getReadOnlyHeaders(
  headers: AgentHeader[] | null | undefined,
): AgentHeader[] {
  return (headers ?? []).filter(header => !isEditableHeader(header));
}

export function buildCustomHeader(header: HeaderData): AgentHeader {
  const name = header.name.trim();
  if (header.type === 'direct') {
    return { name, value: { value: header.value } };
  }
  return {
    name,
    value: {
      valueFrom: {
        secretKeyRef: {
          name: header.value,
          key: header.secretKey ?? DEFAULT_SECRET_KEY,
        },
      },
    },
  };
}

export function mapCustomHeadersToRows(
  headers: AgentHeader[] | null | undefined,
): HeaderData[] {
  const editableHeaders = (headers ?? []).filter(isEditableHeader);
  if (editableHeaders.length === 0) {
    return [EMPTY_HEADER_ROW];
  }
  return editableHeaders.map(header => {
    const secretKeyRef = header.value.valueFrom?.secretKeyRef;
    if (secretKeyRef) {
      return {
        key: generateUniqueKey(),
        name: header.name,
        type: 'secret' as const,
        value: secretKeyRef.name,
        secretKey: secretKeyRef.key,
      };
    }
    return {
      key: generateUniqueKey(),
      name: header.name,
      type: 'direct' as const,
      value: header.value.value ?? '',
    };
  });
}

export function validateCustomHeaders(
  rows: HeaderData[],
  readOnlyHeaders: AgentHeader[] = [],
): CustomHeadersValidation {
  const { errors, hasErrors, nonEmptyHeaders } = validateHeaders(rows);
  const uniqueErrors = { ...errors };
  let hasUniqueErrors = hasErrors;
  const seenNames = new Set(
    readOnlyHeaders.map(header => header.name.trim().toLowerCase()),
  );
  nonEmptyHeaders.forEach(header => {
    const normalizedName = header.name.trim().toLowerCase();
    if (normalizedName === '') {
      return;
    }
    if (seenNames.has(normalizedName)) {
      uniqueErrors[header.key] = {
        ...uniqueErrors[header.key],
        nameError: 'Header name must be unique',
      };
      hasUniqueErrors = true;
    }
    seenNames.add(normalizedName);
  });
  return {
    errors: uniqueErrors,
    hasErrors: hasUniqueErrors,
    headers: [...nonEmptyHeaders.map(buildCustomHeader), ...readOnlyHeaders],
  };
}

export function normalizeCustomHeaders(
  headers: AgentHeader[] | null | undefined,
): AgentHeader[] {
  return validateCustomHeaders(
    mapCustomHeadersToRows(headers),
    getReadOnlyHeaders(headers),
  ).headers;
}

export function useCustomHeaderRows(initialHeaders?: AgentHeader[]) {
  const [initialRows] = useState(() => mapCustomHeadersToRows(initialHeaders));
  const [readOnlyHeaders, setReadOnlyHeaders] = useState(() =>
    getReadOnlyHeaders(initialHeaders),
  );
  const headerRows = useHeaderRows(initialRows);
  const { headers, setHeaders, setHeaderErrors } = headerRows;

  const load = useCallback(
    (loadedHeaders: AgentHeader[] | null | undefined) => {
      setHeaders(mapCustomHeadersToRows(loadedHeaders));
      setReadOnlyHeaders(getReadOnlyHeaders(loadedHeaders));
      setHeaderErrors({});
    },
    [setHeaders, setHeaderErrors],
  );

  const validate = useCallback((): AgentHeader[] | null => {
    const result = validateCustomHeaders(headers, readOnlyHeaders);
    setHeaderErrors(result.errors);
    return result.hasErrors ? null : result.headers;
  }, [headers, readOnlyHeaders, setHeaderErrors]);

  const toPayload = useCallback(
    (): AgentHeader[] =>
      validateCustomHeaders(headers, readOnlyHeaders).headers,
    [headers, readOnlyHeaders],
  );

  return { ...headerRows, readOnlyHeaders, load, validate, toPayload };
}

export type CustomHeaderRows = ReturnType<typeof useCustomHeaderRows>;
