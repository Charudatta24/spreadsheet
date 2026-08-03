"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Check, Loader2, ShieldCheck, UserCheck } from "lucide-react";
import type { AccountType } from "@/types";

export function AccountTypePromptModal() {
  const { user, requiresAccountType, setRequiresAccountType, setUser } = useAuthStore();
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  if (!requiresAccountType || !user) return null;

  const currentUser = user;

  async function handleConfirm() {
    if (!selectedType) {
      setError("Please select an account type.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await setUserProfile(currentUser.uid, {
        accountType: selectedType,
      });

      setUser({ ...currentUser, accountType: selectedType });
      setSavedMessage(true);

      setTimeout(() => {
        setRequiresAccountType(false);
      }, 1800);
    } catch (err) {
      console.error(err);
      setError("Failed to save account type. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[min(95vw,440px)] w-full p-6 border border-sheet-border/50 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-sheet-text mb-1">Select your account type</h2>
          <p className="text-xs text-sheet-muted">
            This selection cannot be changed later.
          </p>
        </div>

        {savedMessage ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
            <Check size={28} className="mx-auto text-emerald-600 animate-bounce" />
            <p className="text-xs font-semibold text-emerald-800">
              Your account type has been saved. This selection cannot be changed at this time.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedType("owner")}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                  selectedType === "owner"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-700 ring-2 ring-emerald-500/30"
                    : "border-sheet-border hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedType === "owner" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <ShieldCheck size={24} />
                </div>
                <span className="font-bold text-sm">Owner</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType("non-owner")}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                  selectedType === "non-owner"
                    ? "border-blue-500 bg-blue-50/50 text-blue-700 ring-2 ring-blue-500/30"
                    : "border-sheet-border hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedType === "non-owner" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <UserCheck size={24} />
                </div>
                <span className="font-bold text-sm">Non-Owner</span>
              </button>
            </div>

            {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

            <button
              type="button"
              disabled={loading || !selectedType}
              onClick={handleConfirm}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 text-xs uppercase tracking-wider"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {loading ? "Saving..." : "Confirm Account Type"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
