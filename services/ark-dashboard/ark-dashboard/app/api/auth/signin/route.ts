import { signIn } from '@/auth';

export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;

  return signIn(process.env.OIDC_PROVIDER_ID, {
    redirectTo: searchParams.get('callbackUrl') ?? '/',
  });
}
