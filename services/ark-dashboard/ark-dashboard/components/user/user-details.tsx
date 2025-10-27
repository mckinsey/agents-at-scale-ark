'use client';

import type { User } from '@/lib/types/user';

/* eslint-disable @next/next/no-img-element */

type Props = {
  user: User;
};

export function UserDetails({ user }: Props) {
  return (
    <div className="flex gap-2">
      <span className="relative flex size-8 h-8 w-8 shrink-0 overflow-hidden rounded-lg select-none">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || 'Avatar'}
            className="aspect-square select-none"
          />
        ) : (
          <div className="bg-foreground text-background flex aspect-square items-center justify-center">
            {user.name
              ?.split(' ')
              .slice(0, 2)
              .map(i => i[0])}
          </div>
        )}
      </span>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
    </div>
  );
}
