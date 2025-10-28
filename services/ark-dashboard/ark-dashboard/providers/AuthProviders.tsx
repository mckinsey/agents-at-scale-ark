import { SessionProvider } from 'next-auth/react';
import type { PropsWithChildren } from 'react';

import { auth } from '@/auth';
import { AuthUtilsWrapper } from '@/components/auth';

import { UserProvider } from './UserProvider';

export async function SSOModeProvider({ children }: PropsWithChildren) {
  const session = await auth();

  return (
    <SessionProvider session={session}>
      <AuthUtilsWrapper />
      <UserProvider user={session?.user}>{children}</UserProvider>
    </SessionProvider>
  );
}

export function OpenModeProvider({ children }: PropsWithChildren) {
  return <UserProvider>{children}</UserProvider>;
}
