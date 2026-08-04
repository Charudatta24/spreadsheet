"use client";

import { useState, useEffect } from "react";
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
import { getUserNickname, setUserProfile } from "@/lib/firebase/firestore";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Stores the partially-built user while waiting for nickname input
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const { setUser } = useAuthStore();

  async function finishSignIn(uid: string, displayName: string, email: string | null, photoURL: string | null) {
    // Fresh Google login — owners will see the 2-month retention notice after auth completes
    markOwnerRetentionNoticePending();

    const color = colorForUid(uid);

    let savedNickname: string | null = null;
    try {
      savedNickname = await getUserNickname(uid);
    } catch (e) {
      console.error("Failed to fetch nickname after sign-in", e);
    }

    const user: AppUser = {
      uid,
      displayName: displayName || "User",
      email,
      photoURL,
      color,
      isAnonymous: false,
      nickname: savedNickname ?? undefined,
    };

    if (savedNickname) {
      setUser(user);
      try {
        await setUserProfile(user.uid, {
          displayName: user.displayName,
          email: user.email,
          nickname: savedNickname,
        });
      } catch (e) {
        console.error("Failed to update profile after sign-in", e);
      }
    } else {
      setPendingUser(user);
    }
  }

  // Complete redirect-based Google sign-in (fallback when popup is blocked)
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
      // Open the popup immediately from the click handler.
      // Do not set loading / re-render first — that breaks the user gesture
      // and often causes popup-blocked or popup-closed-by-user errors.
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

      // Fall back to redirect when popup cannot be used
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
    setUser({ ...pendingUser, nickname });
    setPendingUser(null);
  }

  return (
    <>
      {/* Nickname prompt shown after Google sign-in for first-time users */}
      {pendingUser && (
        <NicknameModal onConfirm={handleNicknameConfirm} />
      )}

      {loading && <LoadingPortal fullPage />}

      <div className="flex items-center justify-center h-screen bg-sheet-bg">
        <div className="w-full max-w-sm mx-4">
          {/* Logo */}
            <div className="inline-flex items-center gap-3 mb-3">
              <span className="text-2xl font-black text-sheet-text tracking-tight">
                MeasureSheets
              </span>
            </div>

          <div className="bg-sheet-surface rounded-xl border border-sheet-border p-6 space-y-4">
            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              {loading ? "Signing in…" : "Continue with Google"}
            </button>

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
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
