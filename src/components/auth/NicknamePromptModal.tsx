"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { isNicknameTaken, setUserProfile } from "@/lib/firebase/firestore";
import { Check, Loader2 } from "lucide-react";

/**
 * NicknamePromptModal
 *
 * Shown automatically for ANY logged-in user (new or existing) who does not
 * yet have a nickname set. Reads `requiresNickname` from the auth store and
 * saves the nickname to Firestore before clearing the flag.
 */
export function NicknamePromptModal() {
  const { user, requiresNickname, setRequiresNickname, setUser } = useAuthStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (requiresNickname) {
      inputRef.current?.focus();
    }
  }, [requiresNickname]);

  if (!requiresNickname || !user) return null;

  const currentUser = user;

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a nickname.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const isTaken = await isNicknameTaken(trimmed, currentUser.uid);
      if (isTaken) {
        setError("This nickname is already taken. Try another.");
        setLoading(false);
        return;
      }

      await setUserProfile(currentUser.uid, { nickname: trimmed });
      setUser({ ...currentUser, nickname: trimmed });
      setRequiresNickname(false);
    } catch {
      setError("Failed to save nickname. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.50)" }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        style={{ animation: "nickname-prompt-in 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xl">
            ✏️
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
              Choose a nickname
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              This will show up while you collaborate.
            </p>
          </div>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="e.g. Alex, Phani, DataWizard…"
          maxLength={32}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 transition-all mb-1 font-medium"
        />
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

        {/* Save */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-3 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {loading ? "Saving…" : "Save nickname"}
        </button>

        <p className="text-[11px] text-slate-400 text-center mt-3">
          You can change this later from your profile.
        </p>
      </div>

      <style>{`
        @keyframes nickname-prompt-in {
          from { opacity: 0; transform: scale(0.94) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
