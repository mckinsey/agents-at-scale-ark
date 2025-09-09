'use client'
/* eslint-disable @next/next/no-img-element */
import { useSession } from "next-auth/react";

export function UserDetails() {
  const { data: session } = useSession();

  return (
    <>
      {session?.user ? (
        <div className="flex gap-2">
          <span className="relative flex size-8 shrink-0 overflow-hidden h-8 w-8 rounded-lg select-none">
            {session?.user.image ? (
              <img
                src={session?.user.image}
                alt={session?.user.name || "Avatar"}
                className="aspect-square select-none"
              />
            ) : (
              <div className="aspect-square flex items-center justify-center bg-foreground text-background">
                {session?.user.name
                  ?.split(" ")
                  .slice(0, 2)
                  .map((i) => i[0])}
              </div>
            )}
          </span>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{session?.user.name}</span>
            <span className="truncate text-xs">{session?.user.email}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
