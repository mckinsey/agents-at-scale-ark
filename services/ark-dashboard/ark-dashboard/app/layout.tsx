import type { Metadata } from "next";

import "./globals.css";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/toaster";
import { SSOModeProvider, OpenModeProvider } from "@/providers/AuthProviders";

const geistSans = localFont({
  src: [
    { path: "./fonts/geist-v3-latin-200.woff2", weight: "200", style: "light" },
    {
      path: "./fonts/geist-v3-latin-regular.woff2",
      weight: "400",
      style: "normal"
    },
    {
      path: "./fonts/geist-v3-latin-600.woff2",
      weight: "600",
      style: "medium"
    },
    { path: "./fonts/geist-v3-latin-800.woff2", weight: "800", style: "bold" }
  ],
  variable: "--font-geist-sans",
  display: "swap"
});

const geistMono = localFont({
  src: [
    {
      path: "./fonts/geist-mono-v3-latin-regular.woff2",
      weight: "400",
      style: "normal"
    },
    {
      path: "./fonts/geist-mono-v3-latin-800.woff2",
      weight: "800",
      style: "bold"
    }
  ],
  variable: "--font-geist-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ARK Dashboard",
  description: "Basic Configuration and Monitoring for ARK"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isSSOEnabled = process.env.AUTH_MODE === 'sso'
  const AuthProvider = isSSOEnabled ? SSOModeProvider : OpenModeProvider

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
