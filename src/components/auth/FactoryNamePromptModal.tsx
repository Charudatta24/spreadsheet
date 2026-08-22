"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Building2, Check, Loader2 } from "lucide-react";

export function FactoryNamePromptModal() {
  const { user, requiresFactoryName, setRequiresFactoryName, setUser } = useAuthStore();
  const [factoryName, setFactoryName] = useState(user?.factoryName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!requiresFactoryName || !user) return null;

  const currentUser = user;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = factoryName.trim();
    if (!trimmed) {
      setError("Please enter your Factory Name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await setUserProfile(currentUser.uid, {
        factoryName: trimmed,
      });

      setUser({ ...currentUser, factoryName: trimmed });
      setRequiresFactoryName(false);
    } catch (err) {
      console.error(err);
      setError("Failed to save Factory Name. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[min(95vw,420px)] w-full p-6 border border-sheet-border/50">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 border border-indigo-100">
            <Building2 size={28} />
          </div>
          <h2 className="text-xl font-bold text-sheet-text mb-1">Enter your Factory Name</h2>
          <p className="text-xs text-sheet-muted">
            Your Factory Name will be displayed at the top of generated PDFs and measurement reports.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Factory / Business Name
            </label>
            <input
              type="text"
              value={factoryName}
              onChange={(e) => setFactoryName(e.target.value)}
              placeholder="e.g. Valley Stone Granites"
              className="w-full px-4 py-3 rounded-xl border border-sheet-border bg-sheet-bg text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-medium text-sm transition-shadow"
              autoFocus
              required
            />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !factoryName.trim()}
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 text-xs uppercase tracking-wider"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? "Saving..." : "Confirm Factory Name"}
          </button>
        </form>
      </div>
    </div>
  );
}
