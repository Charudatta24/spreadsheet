"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Check, Loader2 } from "lucide-react";

export function NamePromptModal() {
  const {
    user,
    requiresName,
    setRequiresName,
    requiresAccountType,
    requiresWorkType,
    requiresFactoryName,
    requiresPhoneNumber,
    requiresNickname,
    setUser,
  } = useAuthStore();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (
    !requiresName ||
    !user ||
    requiresAccountType ||
    requiresWorkType ||
    requiresFactoryName ||
    requiresPhoneNumber ||
    requiresNickname
  )
    return null;

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
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 border border-blue-100">
            <span className="text-2xl font-bold">👋</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2 font-['Cinzel','Playfair_Display',serif]">Welcome</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Your Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-xl border border-sheet-border bg-sheet-bg text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 font-medium text-sm transition-all"
              autoFocus
              required
            />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 text-xs uppercase tracking-wider"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? "Saving..." : "Continue to App"}
          </button>
        </form>
      </div>
    </div>
  );
}
