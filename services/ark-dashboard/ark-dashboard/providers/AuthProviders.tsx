import { PropsWithChildren } from "react";
import { SessionProvider } from "next-auth/react";
import { UserProvider } from "./UserProvider";
import { AuthUtilsWrapper } from "@/components/auth";
import { auth } from "@/auth";

export async function SSOModeProvider({ children }: PropsWithChildren) {
  const session = await auth()

  return (
    <SessionProvider session={session}>
      <AuthUtilsWrapper />
      <UserProvider user={session?.user}>
        {children}
      </UserProvider>
    </SessionProvider>
  )
}

export function OpenModeProvider({ children }: PropsWithChildren) {
  return (
    <UserProvider>
      {children}
    </UserProvider>
  )
}
