import {KubeConfig} from '@kubernetes/client-node';

export function resolveNamespace(explicit?: string): string {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const contextName = kc.getCurrentContext();
  if (!contextName) {
    return 'default';
  }
  const ctx = kc.getContextObject(contextName);
  if (ctx && ctx.namespace && ctx.namespace.length > 0) {
    return ctx.namespace;
  }
  return 'default';
}
