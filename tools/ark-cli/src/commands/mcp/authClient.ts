export interface AuthStartResponse {
  auth_id: string;
  authorization_url: string;
  flow_expires_at: string;
}

export interface AuthStatusResponse {
  state: 'pending' | 'authorized' | 'failed' | 'expired';
  expires_at?: string | null;
  message?: string | null;
  controller_state?: string | null;
  controller_message?: string | null;
}

export interface AuthLogoutResponse {
  cleared_keys?: string[];
  deleted?: boolean;
  noop?: boolean;
}

export interface AuthStartBody {
  force?: boolean;
  scope?: string[];
}

export interface AuthLogoutBody {
  keep_client?: boolean;
  delete_secret?: boolean;
}

export class AuthHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export class McpAuthClient {
  constructor(private baseUrl: string) {}

  async start(
    name: string,
    namespace: string,
    body: AuthStartBody
  ): Promise<AuthStartResponse> {
    const url = `${this.baseUrl}/v1/mcp-servers/${encodeURIComponent(name)}/auth/start?namespace=${encodeURIComponent(namespace)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new AuthHttpError(response.status, await response.text());
    }
    return (await response.json()) as AuthStartResponse;
  }

  async status(
    name: string,
    namespace: string,
    authId: string
  ): Promise<AuthStatusResponse> {
    const url = `${this.baseUrl}/v1/mcp-servers/${encodeURIComponent(name)}/auth/status?namespace=${encodeURIComponent(namespace)}&auth_id=${encodeURIComponent(authId)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new AuthHttpError(response.status, await response.text());
    }
    return (await response.json()) as AuthStatusResponse;
  }

  async logout(
    name: string,
    namespace: string,
    body: AuthLogoutBody
  ): Promise<AuthLogoutResponse> {
    const url = `${this.baseUrl}/v1/mcp-servers/${encodeURIComponent(name)}/auth/logout?namespace=${encodeURIComponent(namespace)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new AuthHttpError(response.status, await response.text());
    }
    return (await response.json()) as AuthLogoutResponse;
  }
}
