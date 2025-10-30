'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';

import type { User } from '@/lib/types/user';

type Props = {
  user?: User | null;
};

interface UserContext {
  user?: User | null;
}

const UserContext = createContext<UserContext | undefined>(undefined);

function UserProvider({ children, user }: PropsWithChildren<Props>) {
  return (
    <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>
  );
}

function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
}

export { UserProvider, useUser };
