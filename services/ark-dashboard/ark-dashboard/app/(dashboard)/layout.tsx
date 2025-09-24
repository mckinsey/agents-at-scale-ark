"use client"

import { Providers } from "./providers";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (<Providers>{children}</Providers>);
}
