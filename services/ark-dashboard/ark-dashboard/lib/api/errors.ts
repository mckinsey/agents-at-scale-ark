export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof APIError && error.status === 404;
}
