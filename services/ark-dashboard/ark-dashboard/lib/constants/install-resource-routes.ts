export const INSTALL_RESOURCE_ROUTES: Readonly<
  Record<string, (name: string) => string>
> = {
  Agent: name => `/agents/${encodeURIComponent(name)}`,
  Team: name => `/teams/${encodeURIComponent(name)}`,
  MCPServer: name => `/mcp/${encodeURIComponent(name)}/update`,
  Model: name => `/models/${encodeURIComponent(name)}/update`,
  A2AServer: name => `/a2a/${encodeURIComponent(name)}`,
  Tool: name => `/tools/${encodeURIComponent(name)}`,
};

export const STUDIO_RESOURCE_KINDS: readonly string[] = ['Agent', 'Team'];

export function getInstallResourceHref(
  kind: string,
  name: string,
): string | undefined {
  return INSTALL_RESOURCE_ROUTES[kind]?.(name);
}

export function getInstallResourceLinkLabel(kind: string): string {
  return STUDIO_RESOURCE_KINDS.includes(kind) ? 'Open in studio' : 'Open';
}
