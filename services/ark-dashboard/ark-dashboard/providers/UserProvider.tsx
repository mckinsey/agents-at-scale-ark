'use client';

import { Session } from 'next-auth';
import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';

type User = Session['user']

interface UserContext {
  user?: User
}

const UserContext = createContext<UserContext | undefined>(
  undefined
);

type UserProviderProps = {
  user?: User
};

export const UserProvider = ({
  user,
  children
}: PropsWithChildren<UserProviderProps>) => {
  return (
    <UserContext.Provider value={{user}}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
};
