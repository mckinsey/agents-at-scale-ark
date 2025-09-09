import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from "./auth";
import type { Session } from "next-auth";
import { getToken } from "next-auth/jwt";
import { SESSION_TOKEN } from './lib/auth/auth-config';

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
      cookieName: SESSION_TOKEN
    })
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
    const response = NextResponse.rewrite(targetUrl);
    response.headers.set('X-Forwarded-Prefix', '/api');
    response.headers.set('X-Forwarded-Host', request.headers.get('host') || '');
    response.headers.set('X-Forwarded-Proto', request.nextUrl.protocol.slice(0, -1)); // Remove trailing ':'
    response.headers.set('Authorization', `Bearer ${token?.access_token}`);
    return response;
  }
  
  // For all other requests, continue normally
  return NextResponse.next();
}

type NextRequestWithAuth = NextRequest & {
  auth: Session
}

export default auth(async (req: NextRequestWithAuth) => {
  //If no user session redirect to signin page
  if (!req.auth) {
    //If the user is trying to access a page other than the signin page, set it as the callback url.
    if(req.nextUrl.pathname !== "/api/signin") {
      const newUrl = new URL(`/api/signin?callbackUrl=${encodeURIComponent(req.url)}`, req.nextUrl.origin)
      return NextResponse.redirect(newUrl)
    }
    return NextResponse.next()
  }

  return middleware(req)
})

export const config = {
  matcher: '/((?!api/auth|signout|_next/static|_next/image|favicon.ico).*)'
};
