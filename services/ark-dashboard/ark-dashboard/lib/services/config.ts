export const configService = {
  getArgoUrl(): string {
    return process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746';
  },
};
