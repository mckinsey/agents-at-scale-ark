const PERSONAL_SECRET_PREFIX = /^u-[0-9a-f]{16}-/;

export function hasPersonalSecretPrefix(name: string): boolean {
  return PERSONAL_SECRET_PREFIX.test(name);
}
