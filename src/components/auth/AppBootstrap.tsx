"use client";

import { useAuthInit } from "@/hooks/useAuthInit";
import { useAuthStore } from "@/lib/sync/authStore";
import { AuthGate } from "./AuthGate";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { OwnerRetentionNotice } from "./OwnerRetentionNotice";

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  useAuthInit();

  const { initialized } = useAuthStore();

  if (!initialized) {
    return <LoadingGrid fullPage size="lg" label="Initializing application..." />;
  }

  return (
    <AuthGate>
      <div className="reveal-content h-full w-full">{children}</div>
      <OwnerRetentionNotice />
    </AuthGate>
  );
}