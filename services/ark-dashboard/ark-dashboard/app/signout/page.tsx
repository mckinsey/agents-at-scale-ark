"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const LogoutPage = () => {
  const router = useRouter();

  useEffect(() => {
    signOut({ redirect: false });
  }, []);

  return (
    <div>
      <h1>Logging out...</h1>
      <button onClick={() => router.push("/")}>back to login page</button>
    </div>
  );
};

export default LogoutPage;