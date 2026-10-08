"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Client-side session context. Wrapped around the app in app/layout.tsx so any
 * client component can call useSession()/signIn()/signOut().
 */
export default function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
