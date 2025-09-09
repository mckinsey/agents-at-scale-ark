"use client";

import { useSession } from "next-auth/react";
import { useRef, useCallback, useState } from "react";
import { useWindowFocus } from "./useWindowFocus";
import { useConditionalInterval } from "./useConditionalInterval";
import { redirect, RedirectType } from "next/navigation";

const refreshThresholdMs = 10 * 60 * 1000 //10mins

export function useRefreshAccessToken() {
  const { status, update } = useSession();
  const isUpdatingRef = useRef(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const safeUpdate = useCallback(async () => {
    if (isUpdatingRef.current) {
      console.warn("[useRefreshAccessToken] Update already in progress, skipping");
      return;
    }

    if (status === "loading") {
      console.warn("[useRefreshAccessToken] Cannot update session: loading");
      return;
    }

    try {
      isUpdatingRef.current = true;
      setIsUpdating(true);

      // Do not forward arbitrary data (e.g., click events) to update().
      // Only send the refresh flag to avoid serialization issues.
      console.log("[useRefreshAccessToken] Updating session");
      const result = await update({ shouldRefreshToken: true });

      if (result && "error" in result && result.error) {
        console.error("[useRefreshAccessToken] Session update failed:", result.error);
        redirect('/api/auth/signin', RedirectType.replace)
      }
    } catch (error) {
      console.error("[useRefreshAccessToken] Session update error:", error);
      redirect('/api/auth/signin', RedirectType.replace)
    } finally {
      isUpdatingRef.current = false;
      setIsUpdating(false);
    }
  }, [status, update]);

  const combinedStatus = isUpdating ? "updating" : status;

  useWindowFocus({
    onFocus: safeUpdate
  });

  useConditionalInterval({
    callback: safeUpdate,
    delay: refreshThresholdMs,
    condition: combinedStatus === "authenticated"
  });
}
