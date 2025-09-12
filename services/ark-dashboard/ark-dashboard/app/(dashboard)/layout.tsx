"use client"

import { useAutoSignout } from "@/hooks/useAutoSignout";
import { useRefreshAccessToken } from "@/hooks/useRefreshAccessToken";
import { Providers } from "./providers";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  useAutoSignout()
  useRefreshAccessToken()

  return (<Providers>{children}</Providers>);
}
