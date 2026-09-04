"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthInit } from "@/hooks/useAuthInit";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoginScreen } from "./LoginScreen";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { SplashIntro } from "./SplashIntro";

/**
 * Reads localStorage synchronously on the CLIENT only.
 * Returns true if a logged-in session exists.
 */
function checkIsLoggedIn(): boolean {
  try {
    if (localStorage.getItem("collabsheet_is_logged_in") === "true") return true;
    const storedAuth = localStorage.getItem("collabsheet-auth");
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth);
      if (parsed?.state?.user) return true;
    }
  } catch (_) {}
  return false;
}

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  useAuthInit();

  const { user, initialized } = useAuthStore();
  const router = useRouter();

  /**
   * `mounted` — false until useEffect fires after first paint.
   * We render nothing before mount to avoid SSR/hydration mismatch
   * where the server doesn't know the user is logged in (no localStorage).
   */
  const [mounted, setMounted] = useState(false);
  const [isKnownLoggedIn, setIsKnownLoggedIn] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    const loggedIn = checkIsLoggedIn();
    setIsKnownLoggedIn(loggedIn);
    // If logged in, pre-set introComplete so SplashIntro NEVER plays on refresh
    if (loggedIn) setIntroComplete(true);
    setMounted(true);
  }, []);

  // If user is authenticated and lands on root/login, redirect to /hub immediately
  useEffect(() => {
    if (initialized && user) {
      try {
        localStorage.setItem("collabsheet_is_logged_in", "true");
      } catch (_) {}
      if (typeof window !== "undefined" && window.location.pathname === "/") {
        router.replace("/hub");
      }
    }
  }, [user, initialized, router]);

  // ── Before client mount: render nothing to avoid hydration mismatch ────────
  // This is a single-frame blank — imperceptible to users.
  if (!mounted) {
    return null;
  }

  // ── 1. LOGGED-IN USERS: page content + blur overlay during rehydration ─────
  // NEVER show SplashIntro to logged-in users!
  if (user || isKnownLoggedIn) {
    const isRehydrating = !initialized || !user;

    return (
      <>
        {/* Actual page content always rendered underneath */}
        <div className={`h-full w-full${isRehydrating ? " pointer-events-none" : ""}`}>
          {children}
        </div>

        {/* Blurred overlay loading animation while Firebase rehydrates */}
        {isRehydrating && (
          <LoadingGrid overlay label="Loading workspace…" />
        )}
      </>
    );
  }

  // ── 2. LOGGED-OUT USERS: SplashIntro → LoginScreen ────────────────────────
  if (!introComplete) {
    return <SplashIntro onComplete={() => setIntroComplete(true)} />;
  }

  return <LoginScreen />;
}