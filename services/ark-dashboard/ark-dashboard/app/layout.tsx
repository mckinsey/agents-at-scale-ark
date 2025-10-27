import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { GlobalProviders } from '@/providers/GlobalProviders';

import './globals.css';

const geistSans = localFont({
  src: [
    { path: './fonts/geist-v3-latin-200.woff2', weight: '200', style: 'light' },
    {
      path: './fonts/geist-v3-latin-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/geist-v3-latin-600.woff2',
      weight: '600',
      style: 'medium',
    },
    { path: './fonts/geist-v3-latin-800.woff2', weight: '800', style: 'bold' },
  ],
  variable: '--font-geist-sans',
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
  title: 'ARK Dashboard',
  description: 'Basic Configuration and Monitoring for ARK',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <GlobalProviders>{children}</GlobalProviders>
      </body>
    </html>
  );
}
