import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

interface OIDCWellKnownConfig {
  end_session_endpoint?: string;
}

async function getEndSessionEndpoint(): Promise<string | null> {
  const issuerUrl = process.env.OIDC_ISSUER_URL;

  try {
    const wellKnownUrl = `${issuerUrl}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch OIDC well-known config: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const config: OIDCWellKnownConfig = await response.json();
    return config.end_session_endpoint || null;
  } catch (error) {
    console.error('Error fetching OIDC well-known configuration:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const baseURL = request.nextUrl.origin;
  const redirectURL = `${baseURL}/signout`;
  if (!session?.user?.idToken) {
    return NextResponse.redirect(new URL("/", baseURL)); // no session, just go home
  }

  // Fetch the end session endpoint from the OIDC provider's well-known configuration
  const endSessionEndpoint = await getEndSessionEndpoint();
  const fallbackEndpoint = `${process.env.OIDC_ISSUER_URL}/oidc/logout`;

  if (!endSessionEndpoint) {
    console.error('Unable to retrieve end session endpoint from OIDC provider');
    // Fallback to the configured issuer with a common logout path
    console.log('Using fallback endpoint:', fallbackEndpoint);
  }

  const url = endSessionEndpoint ? new URL(endSessionEndpoint) : new URL(fallbackEndpoint);
  url.searchParams.append("id_token_hint", session?.user.idToken ?? "");
  url.searchParams.append("post_logout_redirect_uri", redirectURL ?? "");
  url.searchParams.append("client_id", process.env.OIDC_CLIENT_ID ?? "");

  return NextResponse.redirect(url);
}