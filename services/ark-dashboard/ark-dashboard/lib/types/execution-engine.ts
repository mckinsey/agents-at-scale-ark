export interface ExecutionEngine {
  name: string;
  namespace: string;
  type: string;
  description?: string;
  isAgentic: boolean;
  hasSource: boolean;
  available?: {
    status: string;
    reason?: string;
    message?: string;
  };
  annotations?: Record<string, string>;
}

export interface ExecutionEngineDetail extends ExecutionEngine {
  address?: {
    value?: string;
  };
  source?: {
    image?: string;
    git?: {
      url: string;
      ref?: string;
      path?: string;
    };
  };
  configSchema?: JsonSchema;
  status?: Record<string, unknown>;
}

export interface ExecutionEngineList {
  items: ExecutionEngine[];
  count: number;
}

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
}
