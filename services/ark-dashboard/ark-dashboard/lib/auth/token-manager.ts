import type { JWT } from '@auth/core/jwt';

import { openidConfigManager } from './openid-config-manager';

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export class TokenManager {
  static async getNewAccessToken(token: JWT) {
    const openidConfig = await openidConfigManager.getConfig();

    if (!openidConfig.token_endpoint) {
      throw new Error('OIDC config does not provide a token endpoint');
    }

    const body = new URLSearchParams({
      client_id: process.env.OIDC_CLIENT_ID!,
      client_secret: process.env.OIDC_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token!,
    });

    const response = await fetch(openidConfig.token_endpoint, {
      method: 'POST',
      body,
    });

    const tokensOrError = await response.json();

    if (!response.ok) {
      throw tokensOrError;
    }

    const newTokens = tokensOrError as TokenResponse;

    return {
      ...token,
      access_token: newTokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
      // Some providers only issue refresh tokens once, so preserve if we did not get a new one
      refresh_token: newTokens.refresh_token
        ? newTokens.refresh_token
        : token.refresh_token,
    };
  }
}
