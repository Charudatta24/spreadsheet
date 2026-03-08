"use client";

import { useAuthInit } from "@/hooks/useAuthInit";
import { useAuthStore } from "@/lib/sync/authStore";
import { AuthGate } from "./AuthGate";

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  useAuthInit();

  const { initialized } = useAuthStore();

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-sheet-bg">
        <div className="flex items-center gap-2 text-sheet-muted">
          <div className="w-4 h-4 border-2 border-sheet-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-mono">Loading…</span>
        </div>
      </div>
    );
  }

  return <AuthGate>{children}</AuthGate>;
}