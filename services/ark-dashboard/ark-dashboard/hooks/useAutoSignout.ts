"use client"

import { useSession } from "next-auth/react"
import { useEffect } from "react"

export const useAutoSignout = () => {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session) {
      return
    }
    
    const expiresAt = new Date(session?.expires || '').getTime()
    const now = Date.now()
    const timeout = expiresAt - now

    if (timeout > 0) {
      const timer = setTimeout(() => {
        window.location.href = "/api/auth/federated-signout";
      }, timeout)
      return () => clearTimeout(timer)
    } else {
      // Already expired
      window.location.href = "/api/auth/federated-signout";
    }
  }, [session])
}