/* eslint-disable @next/next/no-img-element */
import { useUser } from "@/providers/UserProvider";

export function UserDetails() {
  const { user } = useUser();

  return (
    <>
      {user ? (
        <div className="flex gap-2">
          <span className="relative flex size-8 shrink-0 overflow-hidden h-8 w-8 rounded-lg select-none">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || "Avatar"}
                className="aspect-square select-none"
              />
            ) : (
              <div className="aspect-square flex items-center justify-center bg-foreground text-background">
                {user.name
                  ?.split(" ")
                  .slice(0, 2)
                  .map((i) => i[0])}
              </div>
            )}
          </span>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
