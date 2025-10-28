//The OIDC endpoint to use to fetch openid configuration
export const OIDC_CONFIG_URL = `${process.env.OIDC_ISSUER_URL}/.well-known/openid-configuration`;

//Paths we use for signing in and out
export const SIGNIN_PATH = '/api/auth/signin';
export const FEDERATED_SIGNOUT_PATH = '/api/auth/federated-signout';
export const SIGNOUT_PAGE = '/signout';

//Custom cookie names
export const COOKIE_SESSION_TOKEN = 'session-token';
export const COOKIE_CALLBACK_URL = 'callback-url';
export const COOKIE_CSRF_TOKEN = 'csrf-token';
export const COOKIE_PKCE_CODE_VERIFIER = 'pkce.code_verifier';
export const COOKIE_STATE = 'state';
export const COOKIE_NONCE = 'nonce';

//Default auth session max age
export const DEFAULT_SESSION_MAX_AGE = 30 * 60; //30mins
