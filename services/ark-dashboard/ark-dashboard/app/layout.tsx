import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

import { GlobalProviders } from '@/providers/GlobalProviders';

import './globals.css';

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
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        <GlobalProviders>{children}</GlobalProviders>
      </body>
    </html>
  );
}
