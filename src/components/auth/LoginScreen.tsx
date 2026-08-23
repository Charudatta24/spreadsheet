"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  type AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { colorForUid } from "@/lib/sync/authStore";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingPortal } from "@/components/ui/LoadingPortal";
import { getUserProfile, setUserProfile } from "@/lib/firebase/firestore";
import { NicknameModal } from "./NicknameModal";
import { markOwnerRetentionNoticePending } from "@/lib/measurementRetention";
import type { AppUser } from "@/types";

const provider = new GoogleAuthProvider();

function authErrorMessage(err: unknown): string {
  const code = (err as AuthError)?.code;
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/popup-blocked":
      return "Popup was blocked. Allow popups for this site and try again.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized for Google sign-in. Add it in Firebase Auth settings.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/internal-error":
      return "Sign-in was interrupted. Please try again.";
    default:
      return code
        ? `Google sign-in failed (${code}). Try again.`
        : "Google sign-in failed. Try again.";
  }
}

export function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const { setUser } = useAuthStore();

  async function finishSignIn(uid: string, displayName: string, email: string | null, photoURL: string | null) {
    markOwnerRetentionNoticePending();
    const color = colorForUid(uid);

    let savedProfile: { displayName?: string; nickname?: string; accountType?: any; workType?: any; factoryName?: string } | null = null;
    try {
      savedProfile = await getUserProfile(uid);
    } catch (e) {
      console.error("Failed to fetch user profile after sign-in", e);
    }

    const savedNickname = savedProfile?.nickname ?? null;
    const savedAccountType = savedProfile?.accountType ?? null;
    const savedWorkType = savedProfile?.workType ?? null;
    const savedFactoryName = savedProfile?.factoryName ?? null;

    const user: AppUser = {
      uid,
      displayName: savedProfile?.displayName || displayName || "User",
      email,
      photoURL,
      color,
      isAnonymous: false,
      nickname: savedNickname ?? undefined,
      accountType: savedAccountType ?? undefined,
      workType: savedWorkType ?? undefined,
      factoryName: savedFactoryName ?? undefined,
    };

    if (savedNickname) {
      setUser(user);
      try {
        localStorage.setItem("collabsheet_is_logged_in", "true");
        await setUserProfile(user.uid, {
          displayName: user.displayName,
          email: user.email,
          nickname: savedNickname,
          accountType: savedAccountType ?? undefined,
          workType: savedWorkType ?? undefined,
          factoryName: savedFactoryName ?? undefined,
        });
      } catch (e) {
        console.error("Failed to update profile after sign-in", e);
      }
      router.replace("/hub");
    } else {
      setPendingUser(user);
    }
  }

  // Complete redirect-based Google sign-in
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled || !result?.user) return;
        setLoading(true);
        const u = result.user;
        await finishSignIn(u.uid, u.displayName ?? "User", u.email, u.photoURL);
      } catch (err) {
        if (!cancelled) {
          console.error("Google redirect sign-in failed", err);
          setError(authErrorMessage(err) || "Google sign-in failed. Try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogle() {
    setError("");
    try {
      const result = await signInWithPopup(auth, provider);
      setLoading(true);
      const u = result.user;
      await finishSignIn(u.uid, u.displayName ?? "User", u.email, u.photoURL);
    } catch (err) {
      const code = (err as AuthError)?.code;
      console.error("Google sign-in failed", err);

      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }

      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/internal-error"
      ) {
        try {
          setLoading(true);
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          console.error("Google redirect fallback failed", redirectErr);
          setError(authErrorMessage(redirectErr) || "Google sign-in failed. Try again.");
          return;
        }
      }

      setError(authErrorMessage(err) || "Google sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNicknameConfirm(nickname: string) {
    if (!pendingUser) return;
    try {
      await setUserProfile(pendingUser.uid, {
        displayName: pendingUser.displayName,
        email: pendingUser.email,
        nickname,
      });
    } catch (e) {
      console.error("Failed to save nickname", e);
    }
    const updated = { ...pendingUser, nickname };
    setUser(updated);
    try {
      localStorage.setItem("collabsheet_is_logged_in", "true");
    } catch (_) {}
    setPendingUser(null);
    router.replace("/hub");
  }

  return (
    <>
      {pendingUser && <NicknameModal onConfirm={handleNicknameConfirm} />}

      {loading && <LoadingPortal fullPage />}

      <div className="relative min-h-screen w-full bg-sheet-bg flex items-center justify-center overflow-hidden animate-slow-login">
        {/* Subtle grid mesh background */}
        <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

        <div className="relative z-10 w-full max-w-sm mx-4 flex flex-col items-center">
          {/* Logo Title & Tagline Container */}
          <div className="flex flex-col items-center justify-center text-center mb-6">
            {/* Logo Title */}
            <div className="login-title-brand flex items-center justify-center gap-2">
              <span className="text-slate-900 font-extrabold uppercase font-['Cinzel','Playfair_Display',serif]">
                Measure
              </span>
              <span className="text-blue-600 font-extrabold uppercase font-['Cinzel','Playfair_Display',serif]">
                Sheets
              </span>
            </div>

            {/* Decorative Ruler Line */}
            <div className="h-[2px] w-28 bg-gradient-to-r from-transparent via-slate-900 to-blue-600 my-2 opacity-60" />

            {/* Tagline */}
            <span className="text-[11px] font-bold tracking-[0.28em] text-slate-500 uppercase font-['Rajdhani']">
              Precision in Every Measurement
            </span>
          </div>

          {/* Google Sign-in Card Container */}
          <div className="w-full bg-sheet-surface rounded-2xl border border-sheet-border p-6 shadow-xl">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 hover:border-blue-500/40 hover:bg-blue-50/20 text-slate-900 font-extrabold text-sm transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 group"
            >
              <GoogleIcon />
              <span className="text-slate-900 group-hover:text-blue-600 transition-colors font-extrabold">
                {loading ? "Signing in…" : "Continue with Google"}
              </span>
            </button>

            {error && (
              <p className="text-red-500 text-xs text-center mt-3 font-medium">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" />
    </svg>
  );
}
