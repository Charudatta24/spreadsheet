"use client";

import { useEffect, useRef, useState } from "react";

import { isNicknameTaken } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";

interface NicknameModalProps {
  onConfirm: (nickname: string) => void;
}

export function NicknameModal({ onConfirm }: NicknameModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a nickname.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const isTaken = await isNicknameTaken(trimmed, user?.uid);
      if (isTaken) {
        setError("This nickname is already taken.");
        setLoading(false);
        return;
      }
      onConfirm(trimmed);
    } catch {
      setError("Failed to verify nickname availability.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        style={{ animation: "nickname-modal-in 0.18s ease" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-sheet-accent/10 flex items-center justify-center text-xl">
            ✏️
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sheet-text">Choose a nickname</h2>
            <p className="text-xs text-sheet-muted mt-0.5">
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
          className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors mb-1"
        />
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

        {/* Save */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-3 px-4 py-2.5 rounded-lg bg-sheet-accent hover:bg-sheet-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? "Checking..." : "Save nickname"}
        </button>

        <p className="text-[11px] text-sheet-muted text-center mt-3">
          You can change this later from your profile.
        </p>
      </div>

      <style>{`
        @keyframes nickname-modal-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
