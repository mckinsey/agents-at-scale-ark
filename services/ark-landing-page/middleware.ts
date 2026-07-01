import { NextResponse } from 'next/server';

import type { NextRequestWithAuth } from './auth';
import { auth } from './auth';
import { SIGNIN_PATH } from './lib/constants/auth';

export default auth(async (req: NextRequestWithAuth) => {
  if (!req.auth) {
    if (req.nextUrl.pathname !== SIGNIN_PATH) {
      const baseURL = process.env.BASE_URL;

      const newUrl = new URL(
        `${SIGNIN_PATH}?callbackUrl=${encodeURIComponent(baseURL ?? '')}`,
        baseURL,
      );

      return NextResponse.redirect(newUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: '/((?!api/auth|signout|_next/static|_next/image|favicon.ico).*)',
};
