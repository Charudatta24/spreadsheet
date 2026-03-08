"use client";

import { useState } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInAnonymously,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { colorForUid } from "@/lib/sync/authStore";
import { useAuthStore } from "@/lib/sync/authStore";
import type { AppUser } from "@/types";

const provider = new GoogleAuthProvider();

export function LoginScreen() {
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUser } = useAuthStore();

  async function handleGoogle() {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      const user: AppUser = {
        uid: u.uid,
        displayName: u.displayName ?? "User",
        email: u.email,
        photoURL: u.photoURL,
        color: colorForUid(u.uid),
        isAnonymous: false,
      };
      setUser(user);
    } catch (e) {
      setError("Google sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnonymous() {
    if (!displayName.trim()) {
      setError("Please enter a display name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signInAnonymously(auth);
      await updateProfile(result.user, { displayName: displayName.trim() });
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("collabsheet-displayname", displayName.trim());
      }
      const user: AppUser = {
        uid: result.user.uid,
        displayName: displayName.trim(),
        email: null,
        photoURL: null,
        color: colorForUid(result.user.uid),
        isAnonymous: true,
      };
      setUser(user);
    } catch (e) {
      setError("Failed to sign in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-sheet-bg">
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4f6ef7" />
              <rect x="8" y="8" width="7" height="7" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="17" y="8" width="7" height="7" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="8" y="17" width="7" height="7" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="17" y="17" width="7" height="7" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
            <span className="text-xl font-bold text-sheet-text tracking-tight">
              CollabSheet
            </span>
          </div>
          <p className="text-sheet-muted text-sm">
            Real-time collaborative spreadsheets
          </p>
        </div>

        <div className="bg-sheet-surface rounded-xl border border-sheet-border p-6 space-y-4">
          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-sheet-border" />
            <span className="text-xs text-sheet-muted">or</span>
            <div className="flex-1 h-px bg-sheet-border" />
          </div>

          {/* Anonymous */}
          <div className="space-y-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnonymous()}
              placeholder="Display name"
              maxLength={32}
              className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors"
            />
            <button
              onClick={handleAnonymous}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-sheet-accent text-white font-medium text-sm hover:bg-sheet-accent-dim transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Join as Guest"}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
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
