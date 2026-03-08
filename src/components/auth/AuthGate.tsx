"use client";

import { useAuthStore } from "@/lib/sync/authStore";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}
