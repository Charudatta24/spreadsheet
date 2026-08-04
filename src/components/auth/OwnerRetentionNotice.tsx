"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Download, X } from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import {
  SHEET_RETENTION_MONTHS,
  peekOwnerRetentionNoticePending,
  clearOwnerRetentionNoticePending,
  purgeExpiredOwnerSheets,
} from "@/lib/measurementRetention";

const AUTO_DISMISS_MS = 10_000;

/**
 * Shown once after a fresh Google login when the account type is owner.
 * Reminds owners that sheets auto-delete after 2 months — download Excel first.
 * Auto-closes after 10 seconds; OK dismisses immediately.
 */
export function OwnerRetentionNotice() {
  const { user, requiresName, requiresAccountType, requiresWorkType } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);

  const dismiss = useCallback(() => {
    clearOwnerRetentionNoticePending();
    setVisible(false);
  }, []);

  // Decide whether to show after login prompts are done
  useEffect(() => {
    if (!user) return;
    // Notice is owner-only; drop the pending flag for non-owners
    if (user.accountType === "non-owner") {
      clearOwnerRetentionNoticePending();
      return;
    }
    if (user.accountType !== "owner") return;
    if (requiresName || requiresAccountType || requiresWorkType) return;
    if (!peekOwnerRetentionNoticePending()) return;
    setVisible(true);
    setSecondsLeft(10);
  }, [user, requiresName, requiresAccountType, requiresWorkType]);

  // Purge expired sheets whenever an owner is fully signed in
  useEffect(() => {
    if (!user || user.accountType !== "owner") return;
    if (requiresName || requiresAccountType || requiresWorkType) return;
    purgeExpiredOwnerSheets(user.uid).catch((err) =>
      console.error("Failed to purge expired measurement sheets", err)
    );
  }, [user, requiresName, requiresAccountType, requiresWorkType]);

  // 10s countdown + auto dismiss
  useEffect(() => {
    if (!visible) return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((AUTO_DISMISS_MS - (Date.now() - started)) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(tick);
        dismiss();
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border border-amber-200 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 relative">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 mb-1">
              Sheet auto-delete reminder
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Measurement sheets you create are{" "}
              <strong>automatically permanently deleted from the database after{" "}
              {SHEET_RETENTION_MONTHS} months</strong>.
              Please download your Excel sheets before they expire so you keep a backup.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-800">
          <Download size={14} className="shrink-0" />
          <span>
            Tip: Open a sheet and use <strong>Export / Download Excel</strong> to save a copy.
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-slate-400 font-medium">
            Closes in {secondsLeft}s
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
