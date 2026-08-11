import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

import { GlobalProviders } from '@/providers/GlobalProviders';

import './globals.css';

// Auth mode (open vs sso) and the resulting provider/session are runtime config
// read via process.env.AUTH_MODE + cookies in GlobalProviders. Without this the
// layout is statically prerendered at build time (AUTH_MODE unset → OpenMode
// baked in), so a single image can't switch modes at runtime: middleware honours
// AUTH_MODE live but the rendered page serves the baked Open provider, leaving
// session.user empty (no user menu / Sign out). Force per-request rendering.
export const dynamic = 'force-dynamic';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const geistMono = localFont({
  src: [
    {
      path: './fonts/geist-mono-v3-latin-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/geist-mono-v3-latin-800.woff2',
      weight: '800',
      style: 'bold',
    },
  ],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ark Dashboard',
  description: 'Basic Configuration and Monitoring for Ark',
};

const analyticsProvider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || 'noop';
const dynatraceRumUrl = process.env.NEXT_PUBLIC_DYNATRACE_RUM_URL;
const shouldLoadDynatraceRum =
  analyticsProvider === 'dynatrace' && !!dynatraceRumUrl;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {shouldLoadDynatraceRum ? (
          <script
            src={dynatraceRumUrl}
            async
            crossOrigin="anonymous"
            data-testid="dynatrace-rum"
          />
        ) : null}
      </head>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        <GlobalProviders>{children}</GlobalProviders>
      </body>
    </html>
  );
}
