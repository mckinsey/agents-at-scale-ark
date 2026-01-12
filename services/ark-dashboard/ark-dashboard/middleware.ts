import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import type { NextRequestWithAuth } from './auth';
import { auth } from './auth';
import { COOKIE_SESSION_TOKEN, SIGNIN_PATH } from './lib/constants/auth';

async function middleware(request: NextRequest) {
  // Get the base path from environment (no default)
  const basePath = process.env.ARK_DASHBOARD_BASE_PATH || '';

  // Proxy anything starting with /api/ to the backend, stripping the /api prefix
  // This includes: /api/v1/*, /api/docs, /api/openapi.json
  const apiPath = `${basePath}/api/`;

  if (request.nextUrl.pathname.startsWith(apiPath)) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: COOKIE_SESSION_TOKEN,
    });
    // Read environment variables at runtime
    const host = process.env.ARK_API_SERVICE_HOST || 'localhost';
    const port = process.env.ARK_API_SERVICE_PORT || '8000';
    const protocol = process.env.ARK_API_SERVICE_PROTOCOL || 'http';

    // Remove the base path and /api prefix to get the backend path
    let backendPath = request.nextUrl.pathname.replace(basePath, '');
    backendPath = backendPath.replace('/api', '');

    // Construct the target URL
    const targetUrl = `${protocol}://${host}:${port}${backendPath}${request.nextUrl.search}`;

    // Rewrite the request to the backend with standard HTTP forwarding headers
    // These X-Forwarded-* headers help the backend understand the external request context:
    // - X-Forwarded-Prefix: tells backend it's being served from /api path externally
    // - X-Forwarded-Host: original host header from the client request
    // - X-Forwarded-Proto: original protocol (http/https) from the client request
    // The backend uses these to generate correct URLs for OpenAPI specs and CORS handling
    // Create new headers for the backend request (NOT the frontend response)
    const backendHeaders = new Headers(request.headers);
    backendHeaders.set('X-Forwarded-Prefix', '/api');
    backendHeaders.set('X-Forwarded-Host', request.headers.get('host') || '');
    backendHeaders.set(
      'X-Forwarded-Proto',
      request.nextUrl.protocol.slice(0, -1),
    ); // Remove trailing ':'
    if (token?.access_token) {
      backendHeaders.set('Authorization', `Bearer ${token.access_token}`);
    }

    const fetchOptions: RequestInit = {
      method: request.method,
      headers: backendHeaders,
    };

    if (request.body) {
      fetchOptions.body = request.body;
    }
    const backendResponse = await fetch(targetUrl, fetchOptions);

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  }

  // For all other requests, continue normally
  return NextResponse.next();
}

export default auth(async (req: NextRequestWithAuth) => {
  //If no user session redirect to signin page
  if (!req.auth) {
    //If the user is trying to access a page other than the signin page, set it as the callback url.
    if (req.nextUrl.pathname !== SIGNIN_PATH) {
      const baseURL = process.env.BASE_URL;

      const newUrl = new URL(
        `${SIGNIN_PATH}?callbackUrl=${encodeURIComponent(baseURL!)}`,
        baseURL,
      );

      return NextResponse.redirect(newUrl);
    }
    return NextResponse.next();
  }

  return middleware(req);
});

export const config = {
  matcher: '/((?!api/auth|signout|_next/static|_next/image|favicon.ico).*)',
};
