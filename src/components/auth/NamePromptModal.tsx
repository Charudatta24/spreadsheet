"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Check, Loader2 } from "lucide-react";

export function NamePromptModal() {
  const { user, requiresName, setRequiresName, setUser } = useAuthStore();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!requiresName || !user) return null;

  // Capture non-null user for use inside async function
  const currentUser = user;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      await setUserProfile(currentUser.uid, {
        displayName: name.trim(),
        email: currentUser.email,
        nickname: currentUser.nickname,
      });
      
      setUser({ ...currentUser, displayName: name.trim() });
      setRequiresName(false);
    } catch (err) {
      console.error(err);
      setError("Failed to save name. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[min(95vw,420px)] w-full p-6 border border-sheet-border/50">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-sheet-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 text-sheet-accent">
            <span className="text-2xl font-bold">👋</span>
          </div>
          <h2 className="text-2xl font-bold text-sheet-text mb-2">Welcome to CollabSheet!</h2>
          <p className="text-sm text-sheet-muted">
            It looks like this is your first time here. Please enter your name so your team knows who you are.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sheet-muted mb-1.5 uppercase tracking-wider">
              Your Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Datta"
              className="w-full px-4 py-3 rounded-xl border border-sheet-border bg-sheet-bg text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:ring-2 focus:ring-sheet-accent/40 transition-shadow"
              autoFocus
              required
            />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full h-12 bg-sheet-accent hover:bg-sheet-accent/90 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sheet-accent/20"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? "Saving..." : "Continue to App"}
          </button>
        </form>
      </div>
    </div>
  );
}
