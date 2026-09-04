"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { setUserProfile } from "@/lib/firebase/firestore";
import { Phone, Check, Loader2 } from "lucide-react";

/**
 * PhoneNumberPromptModal
 *
 * Prompts OWNER accounts (both new and existing users) to enter their phone number
 * if they do not yet have one saved. Persists the phone number to Firestore
 * and local auth state.
 */
export function PhoneNumberPromptModal() {
  const {
    user,
    requiresPhoneNumber,
    setRequiresPhoneNumber,
    requiresAccountType,
    requiresFactoryName,
    setUser,
  } = useAuthStore();
  const [phone, setPhone] = useState(user?.phoneNumber || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (requiresPhoneNumber) {
      inputRef.current?.focus();
    }
  }, [requiresPhoneNumber]);

  // Only show for owners who require a phone number, after account type and factory name are done
  if (
    !requiresPhoneNumber ||
    !user ||
    user.accountType !== "owner" ||
    requiresAccountType ||
    requiresFactoryName
  )
    return null;

  const currentUser = user;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();

    // Validate phone number
    if (!trimmed) {
      setError("Please enter your phone number.");
      return;
    }

    // Strip formatting characters to count raw digits
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      setError("Please enter a valid phone number (at least 10 digits).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await setUserProfile(currentUser.uid, {
        phoneNumber: trimmed,
      });

      setUser({ ...currentUser, phoneNumber: trimmed });
      setRequiresPhoneNumber(false);
    } catch (err) {
      console.error("Failed to save phone number:", err);
      setError("Failed to save phone number. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[105] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-[min(95vw,420px)] w-full p-6 border border-sheet-border/50">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 border border-blue-100">
            <Phone size={28} />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-1 font-['Cinzel','Playfair_Display',serif]">
            Enter your Phone Number
          </h2>
          <p className="text-xs text-sheet-muted">
            Required for Owner accounts to manage factory measurements & orders.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Phone Number
            </label>
            <input
              ref={inputRef}
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="Enter phone number"
              className="w-full px-4 py-3 rounded-xl border border-sheet-border bg-sheet-bg text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 font-medium text-sm transition-all"
              autoFocus
              required
            />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 text-xs uppercase tracking-wider"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? "Saving..." : "Confirm Phone Number"}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          You can modify this anytime in your Account Settings.
        </p>
      </div>
    </div>
  );
}