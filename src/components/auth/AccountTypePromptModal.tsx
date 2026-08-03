"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Check, Loader2, ShieldCheck, UserCheck, Scissors, Sparkles } from "lucide-react";
import type { AccountType, WorkType } from "@/types";

export function AccountTypePromptModal() {
  const {
    user,
    requiresAccountType,
    setRequiresAccountType,
    requiresWorkType,
    setRequiresWorkType,
    setUser,
  } = useAuthStore();

  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  // If user doesn't require account type or work type, render nothing
  if ((!requiresAccountType && !requiresWorkType) || !user) return null;

  const currentUser = user;
  const isWorkTypeOnly = !requiresAccountType && requiresWorkType;

  async function handleConfirmAccountType() {
    if (!selectedType) {
      setError("Please select an account type.");
      return;
    }

    if (selectedType === "non-owner" && !selectedWorkType) {
      setError("Please select your work type (Cutting or Polish).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload: { accountType: AccountType; workType?: WorkType } = {
        accountType: selectedType,
      };

      if (selectedType === "non-owner" && selectedWorkType) {
        payload.workType = selectedWorkType;
      }

      await setUserProfile(currentUser.uid, payload);

      setUser({
        ...currentUser,
        accountType: selectedType,
        workType: selectedWorkType || currentUser.workType,
      });

      setSavedMessage(true);

      setTimeout(() => {
        setRequiresAccountType(false);
        setRequiresWorkType(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      setError("Failed to save selection. Please try again.");
      setLoading(false);
    }
  }

  async function handleConfirmWorkTypeOnly() {
    if (!selectedWorkType) {
      setError("Please select your work type (Cutting or Polish).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await setUserProfile(currentUser.uid, {
        workType: selectedWorkType,
      });

      setUser({
        ...currentUser,
        workType: selectedWorkType,
      });

      setSavedMessage(true);

      setTimeout(() => {
        setRequiresWorkType(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      setError("Failed to save work type. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[min(95vw,460px)] w-full p-6 border border-sheet-border/50 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-sheet-text mb-1">
            {isWorkTypeOnly ? "Select your Work Type" : "Select your account type"}
          </h2>
          <p className="text-xs text-sheet-muted">
            This selection configures your relevant workspace section.
          </p>
        </div>

        {savedMessage ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
            <Check size={28} className="mx-auto text-emerald-600 animate-bounce" />
            <p className="text-xs font-semibold text-emerald-800">
              Your profile selection has been saved.
            </p>
          </div>
        ) : isWorkTypeOnly ? (
          /* Non-Owner Work Type Selection Only */
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedWorkType("cutting")}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                  selectedWorkType === "cutting"
                    ? "border-indigo-500 bg-indigo-50/50 text-indigo-700 ring-2 ring-indigo-500/30"
                    : "border-sheet-border hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedWorkType === "cutting" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <Scissors size={24} />
                </div>
                <span className="font-bold text-sm">Cutting</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedWorkType("polish")}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                  selectedWorkType === "polish"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-700 ring-2 ring-emerald-500/30"
                    : "border-sheet-border hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedWorkType === "polish" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <Sparkles size={24} />
                </div>
                <span className="font-bold text-sm">Polish</span>
              </button>
            </div>

            {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

            <button
              type="button"
              disabled={loading || !selectedWorkType}
              onClick={handleConfirmWorkTypeOnly}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 text-xs uppercase tracking-wider"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {loading ? "Saving..." : "Confirm Work Type"}
            </button>
          </div>
        ) : (
          /* Full Account Type + Work Type Selection */
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedType("owner");
                  setSelectedWorkType(null);
                }}
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

            {/* If Non-Owner chosen, ask for Work Type */}
            {selectedType === "non-owner" && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in">
                <label className="block text-xs font-bold text-slate-700 text-center">
                  Select your Work Type:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedWorkType("cutting")}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                      selectedWorkType === "cutting"
                        ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Scissors size={15} />
                    Cutting
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedWorkType("polish")}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                      selectedWorkType === "polish"
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Sparkles size={15} />
                    Polish
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

            <button
              type="button"
              disabled={loading || !selectedType || (selectedType === "non-owner" && !selectedWorkType)}
              onClick={handleConfirmAccountType}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 text-xs uppercase tracking-wider"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {loading ? "Saving..." : "Confirm Selection"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
