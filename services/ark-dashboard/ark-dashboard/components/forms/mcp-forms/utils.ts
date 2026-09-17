'use client';

import * as z from 'zod';

import type {
  DirectHeader,
  MCPHeader,
  MCPServerAddressSource,
  MCPServerServiceRef,
  MCPServerSpec,
  SecretHeader,
} from '@/lib/services/mcp-servers';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import {
  EMPTY_HEADER_ROW,
  type HeaderData,
  type HeaderError,
  type HeaderRows,
  generateUniqueKey,
  useHeaderRows,
  validateHeaders,
} from '../shared/header-rows';

export { EMPTY_HEADER_ROW, generateUniqueKey, useHeaderRows, validateHeaders };
export type { HeaderData, HeaderError, HeaderRows };

export const CONFIGURATION_VALUE_KEY = 'value';

export type AddressMode =
  | {
      kind: 'configuration';
      originalName?: string;
      originalKey?: string;
      literalUrl?: string;
    }
  | { kind: 'service'; serviceRef: MCPServerServiceRef };

export type UrlFieldState =
  | { kind: 'create' }
  | {
      kind: 'configuration';
      configurationName: string;
      configurationKey: string;
    }
  | { kind: 'literal'; url: string }
  | {
      kind: 'service';
      serviceRef: MCPServerServiceRef;
      resolvedAddress: string;
    };

export function createFormSchema(addressMode: AddressMode) {
  const hasLiteralFallback =
    addressMode.kind === 'configuration' && !!addressMode.literalUrl;
  return z.object({
    name: kubernetesNameSchema,
    description: z.string().optional(),
    configurationName:
      addressMode.kind === 'service' || hasLiteralFallback
        ? z.string()
        : z.string().min(1, 'URL is required'),
    transport: z.enum(['http', 'sse'], {
      message: 'Transport is required',
    }),
  });
}

export type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export function buildHeader(header: HeaderData): MCPHeader {
  if (header.type === 'direct') {
    return { name: header.name, value: { value: header.value } };
  }
  return {
    name: header.name,
    value: {
      valueFrom: { secretKeyRef: { name: header.value, key: 'token' } },
    },
  };
}

export function mapDetailHeaders(
  headers: MCPHeader[] | null | undefined,
): HeaderData[] {
  if (!headers?.length) {
    return [EMPTY_HEADER_ROW];
  }
  return headers.map(header => {
    const isSecret = 'valueFrom' in header.value;
    return {
      key: generateUniqueKey(),
      name: header.name,
      type: isSecret ? 'secret' : 'direct',
      value: isSecret
        ? (header as SecretHeader).value.valueFrom.secretKeyRef.name
        : (header as DirectHeader).value.value || '',
    };
  });
}

export function mapDetailAddress(
  addressSource: MCPServerAddressSource | null | undefined,
  resolvedAddress: string | null | undefined,
): UrlFieldState {
  const valueFrom = addressSource?.valueFrom;
  if (valueFrom?.configMapKeyRef) {
    return {
      kind: 'configuration',
      configurationName: valueFrom.configMapKeyRef.name,
      configurationKey: valueFrom.configMapKeyRef.key,
    };
  }
  if (valueFrom?.serviceRef) {
    return {
      kind: 'service',
      serviceRef: valueFrom.serviceRef,
      resolvedAddress: resolvedAddress ?? '',
    };
  }
  return {
    kind: 'literal',
    url: addressSource?.value ?? resolvedAddress ?? '',
  };
}

export function buildUpdateAddressMode(urlState: UrlFieldState): AddressMode {
  if (urlState.kind === 'service') {
    return { kind: 'service', serviceRef: urlState.serviceRef };
  }
  if (urlState.kind === 'configuration') {
    return {
      kind: 'configuration',
      originalName: urlState.configurationName,
      originalKey: urlState.configurationKey,
    };
  }
  if (urlState.kind === 'literal') {
    return { kind: 'configuration', literalUrl: urlState.url };
  }
  return { kind: 'configuration' };
}

export function buildAddress(
  values: FormValues,
  addressMode: AddressMode,
): MCPServerSpec['address'] {
  if (addressMode.kind === 'service') {
    return { valueFrom: { serviceRef: addressMode.serviceRef } };
  }
  const { originalName, originalKey, literalUrl } = addressMode;
  if (!values.configurationName && literalUrl) {
    return { value: literalUrl };
  }
  const key =
    originalKey && values.configurationName === originalName
      ? originalKey
      : CONFIGURATION_VALUE_KEY;
  return {
    valueFrom: {
      configMapKeyRef: {
        name: values.configurationName,
        key,
      },
    },
  };
}

export function buildSpec(
  values: FormValues,
  headers: HeaderData[],
  addressMode: AddressMode,
): MCPServerSpec {
  return {
    description: values.description?.trim() || undefined,
    transport: values.transport,
    address: buildAddress(values, addressMode),
    headers: headers.map(buildHeader),
  };
}
