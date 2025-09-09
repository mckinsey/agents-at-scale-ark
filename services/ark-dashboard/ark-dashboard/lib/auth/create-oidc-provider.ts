
import type { OktaProfile } from "@auth/core/providers/okta";
import type { OAuthUserConfig, OIDCConfig } from "@auth/core/providers";

export function createOIDCProvider<TP extends OktaProfile>(
  options: OAuthUserConfig<TP> & {name: string, id: string}
): OIDCConfig<TP> {
  return {
    type: "oidc",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile offline_access" } },
    checks: ["pkce", "state"],
    ...options
  };
}