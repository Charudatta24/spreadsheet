"use client";

import React, { useEffect } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import {
  clearOwnerRetentionNoticePending,
  purgeExpiredOwnerSheets,
} from "@/lib/measurementRetention";

/**
 * Shown once after a fresh Google login when the account type is owner.
 * Reminds owners that sheets auto-delete after 2 months — download Excel first.
 * Auto-closes after 10 seconds; OK dismisses immediately.
 */
export function OwnerRetentionNotice() {
  const { user, requiresName, requiresAccountType, requiresWorkType } = useAuthStore();

  useEffect(() => {
    clearOwnerRetentionNoticePending();
  }, []);

  // Purge expired sheets whenever an owner is fully signed in
  useEffect(() => {
    if (!user || user.accountType !== "owner") return;
    if (requiresName || requiresAccountType || requiresWorkType) return;
    purgeExpiredOwnerSheets(user.uid).catch((err) =>
      console.error("Failed to purge expired measurement sheets", err)
    );
  }, [user, requiresName, requiresAccountType, requiresWorkType]);

  return null;
}
