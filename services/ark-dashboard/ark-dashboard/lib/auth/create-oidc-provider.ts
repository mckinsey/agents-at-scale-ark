import type { OAuthUserConfig, OIDCConfig } from '@auth/core/providers';
import type { OktaProfile } from '@auth/core/providers/okta';

import { OIDC_CONFIG_URL, OIDC_SCOPES } from '@/lib/constants/auth';

export function createOIDCProvider<TP extends OktaProfile>(
  options: OAuthUserConfig<TP> & { name: string; id: string },
): OIDCConfig<TP> {
  return {
    type: 'oidc',
    wellKnown: OIDC_CONFIG_URL,
    authorization: { params: { scope: OIDC_SCOPES } },
    checks: ['pkce', 'state'],
    ...options,
  };
}
