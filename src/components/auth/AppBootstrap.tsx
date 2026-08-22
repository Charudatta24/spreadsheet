"use client";

import React, { useState, useEffect } from "react";
import { useAuthInit } from "@/hooks/useAuthInit";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoginScreen } from "./LoginScreen";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { OwnerRetentionNotice } from "./OwnerRetentionNotice";
import { SplashIntro } from "./SplashIntro";

const SESSION_KEY = "collabsheet_visited_session";

/**
 * Synchronously checks if the initial splash intro should be skipped.
 * Returns true if:
 * 1. User is logged in (collabsheet_is_logged_in in localStorage)
 * 2. Zustand persisted auth state contains a user
 * 3. Session storage flag exists
 * 4. Page is being reloaded
 */
function checkShouldSkipIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // 1. Direct logged-in flag in localStorage
    if (localStorage.getItem("collabsheet_is_logged_in") === "true") {
      return true;
    }
    // 2. Zustand persisted auth state in localStorage
    const storedAuth = localStorage.getItem("collabsheet-auth");
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth);
      if (parsed?.state?.user) {
        return true;
      }
    }
    // 3. Session storage flag
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      return true;
    }
    // 4. Page reload detection (Performance Navigation Timing API)
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
      sessionStorage.setItem(SESSION_KEY, "true");
      return true;
    }
    // 5. Legacy performance navigation type (1 = reload)
    if ((performance as any)?.navigation?.type === 1) {
      sessionStorage.setItem(SESSION_KEY, "true");
      return true;
    }
  } catch (_) {}
  return false;
}

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  useAuthInit();

  const { user, initialized } = useAuthStore();

  // Evaluate introFinished state synchronously on initial render
  const [introFinished, setIntroFinished] = useState(() => checkShouldSkipIntro());

  // Ensure intro is immediately marked finished whenever user state exists
  useEffect(() => {
    if (user) {
      setIntroFinished(true);
      try {
        localStorage.setItem("collabsheet_is_logged_in", "true");
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch (_) {}
    }
  }, [user]);

  const handleIntroComplete = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch (_) {}
    setIntroFinished(true);
  };

  // ── STEP 1: FIRST-TIME VISIT BEFORE LOGIN ───────────────────────────────
  // Unauthenticated first-time visitors see SplashIntro ("Measure Sheets" zoom-in).
  if (!introFinished && !user) {
    return <SplashIntro onComplete={handleIntroComplete} />;
  }

  // ── STEP 2: AUTH INITIALIZING / REHYDRATING ─────────────────────────────
  // While Firebase Auth is checking login status on refresh or boot, show LoadingGrid.
  // NEVER show LoginScreen while auth is still initializing!
  if (!initialized) {
    return <LoadingGrid fullPage size="lg" label="Loading workspace…" />;
  }

  // ── STEP 3: AUTH INITIALIZED: CONFIRMED LOGGED-OUT ───────────────────────
  // Firebase Auth has confirmed user is logged out: show LoginScreen.
  if (!user) {
    return <LoginScreen />;
  }

  // ── STEP 4: AUTH INITIALIZED: CONFIRMED LOGGED-IN ───────────────────────
  // User is logged in: render main app content.
  return (
    <>
      <div className="reveal-content h-full w-full">{children}</div>
      <OwnerRetentionNotice />
    </>
  );
}