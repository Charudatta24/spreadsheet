"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Calendar,
  Check,
  Trash2,
  AlertCircle,
  Save,
  Clock,
} from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import {
  subscribeAccountingNote,
  updateAccountingNote,
  deleteAccountingNote,
} from "@/lib/firebase/firestore";
import { formatINR, round2 } from "@/lib/accountingExport";
import type { AccountingNote, AccountingTransaction } from "@/types";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export default function AccountingNotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [note, setNote] = useState<AccountingNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);

  // Subscribe to the note in real-time
  useEffect(() => {
    if (!user || !id) {
      setLoading(false);
      return;
    }
    const unsub = subscribeAccountingNote(user.uid, id, (data) => {
      if (data) {
        setNote(data);
        if (isFirstLoad.current) {
          setNoteText(data.content || "");
          isFirstLoad.current = false;
        }
      } else {
        router.replace("/accounting");
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user, id, router]);

  // Save note & parse transactions
  const triggerSave = useCallback(
    async (text: string) => {
      if (!user || !note) return;
      setSaveStatus("saving");
      setSaveError("");
      try {
        let transactions: AccountingTransaction[] = [];
        let totalSent = 0;
        let totalReceived = 0;

        if (text.trim()) {
          const res = await fetch("/api/accounting/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.trim(), clientDate: note.date }),
          });
          if (res.ok) {
            const result = await res.json();
            const extractedList = result.transactions || (result.data ? [result.data] : []);
            extractedList.forEach((t: { type: string; amount?: number }) => {
              const amt = round2(t.amount || 0);
              if (t.type === "sent") totalSent = round2(totalSent + amt);
              else totalReceived = round2(totalReceived + amt);
            });
            transactions = extractedList;
          }
        }

        await updateAccountingNote(user.uid, note.id, {
          content: text,
          transactions: transactions as AccountingTransaction[],
          totalSent,
          totalReceived,
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus("error");
        setSaveError("Failed to save. Please try again.");
      }
    },
    [user, note]
  );

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setNoteText(text);
    setSaveStatus("unsaved");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerSave(text);
    }, 1200);
  }

  function handleManualSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    triggerSave(noteText);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleDelete() {
    if (!user || !note) return;
    try {
      await deleteAccountingNote(user.uid, note.id);
      router.replace("/accounting");
    } catch (err) {
      console.error(err);
      alert("Failed to delete note.");
    }
  }

  function formatDateFull(dateStr: string) {
    try {
      const d = new Date(dateStr + "T00:00:00");
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const formatted = d.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      if (dateStr === today) return `${formatted} (Today)`;
      if (dateStr === yesterday) return `${formatted} (Yesterday)`;
      return formatted;
    } catch {
      return dateStr;
    }
  }

  function getNoteExpiry(n: AccountingNote): { label: string; urgent: boolean } {
    try {
      const expiresAt =
        n.expiresAt ||
        (n.createdAt ? n.createdAt + 5 * 30 * 24 * 60 * 60 * 1000 : Date.now() + 5 * 30 * 24 * 60 * 60 * 1000);
      const diff = expiresAt - Date.now();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (days <= 0) return { label: "Expired", urgent: true };
      if (days === 1) return { label: "1d left", urgent: true };
      if (days < 30) return { label: `${days}d left`, urgent: days <= 5 };
      const months = Math.ceil(days / 30);
      return { label: `${months}mo left`, urgent: false };
    } catch {
      return { label: "5mo left", urgent: false };
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <p className="text-xs text-slate-500">Loading note...</p>
        </div>
      </div>
    );
  }

  if (!note) return null;

  // Net = Received - Sent (profit/loss)
  const net = round2((note.totalReceived || 0) - (note.totalSent || 0));
  const isProfit = net >= 0;
  const txList: AccountingTransaction[] = note.transactions || [];
  const expiry = getNoteExpiry(note);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 overflow-x-hidden pb-24">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur-md flex items-center px-4 sm:px-6 justify-between shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/accounting"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shrink-0"
            title="Back to Notes"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-600 shrink-0" />
              <h1 className="font-extrabold text-sm sm:text-base text-slate-900 truncate font-['Cinzel','Playfair_Display',serif]">
                {formatDateFull(note.date)}
              </h1>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>{txList.length} transaction{txList.length === 1 ? "" : "s"} recorded</span>
              <span>·</span>
              <span className={`inline-flex items-center gap-1 font-bold ${expiry.urgent ? "text-red-600" : "text-blue-600"}`}>
                <Clock size={10} />
                <span>{expiry.label}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Clear, reliable save status indicator */}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 shadow-2xs">
              <Check size={13} className="stroke-[2.5]" />
              <span>Saved</span>
            </div>
          )}
          {saveStatus === "saving" && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 shadow-2xs">
              <Loader2 size={13} className="animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {saveStatus === "unsaved" && (
            <button
              type="button"
              onClick={handleManualSave}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-2xs"
              title="Click to save now"
            >
              <Clock size={13} />
              <span>Save</span>
            </button>
          )}
          {saveStatus === "error" && (
            <button
              type="button"
              onClick={handleManualSave}
              className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full border border-red-300 transition-colors"
            >
              <AlertCircle size={13} />
              <span>Retry Save</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete Note"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <main className="pt-4 sm:pt-6 px-3 sm:px-6 max-w-4xl mx-auto space-y-4">
        {/* ── Financial Summary Bar (Top) ── */}
        {(note.totalSent > 0 || note.totalReceived > 0) && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-red-100 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-red-400 tracking-wider">SENT</p>
              <p className="text-base sm:text-lg font-extrabold text-red-600 mt-0.5">
                {formatINR(note.totalSent || 0)}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-100 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">RECEIVED</p>
              <p className="text-base sm:text-lg font-extrabold text-emerald-600 mt-0.5">
                {formatINR(note.totalReceived || 0)}
              </p>
            </div>
            {/* NET card: Rupee symbol, green if profit, red if loss */}
            <div
              className={`bg-white rounded-2xl p-3 sm:p-3.5 border shadow-xs ${
                isProfit ? "border-emerald-200" : "border-red-200"
              }`}
            >
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">NET</p>
              <p
                className={`text-base sm:text-lg font-extrabold mt-0.5 ${
                  isProfit ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {isProfit ? "₹" : "-₹"}
                {Math.abs(net).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        )}

        {/* ── Note Writing Div (Clean existing theme: white background, slate-200 border, large writing area) ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/70">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-['Cinzel','Playfair_Display',serif]">
              Note
            </span>
            {saveStatus === "unsaved" && (
              <span className="text-[10px] text-amber-600 font-medium">Unsaved changes...</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[10px] text-emerald-600 font-medium">All changes saved</span>
            )}
            {saveStatus === "saving" && (
              <span className="text-[10px] text-blue-600 font-medium">Saving changes...</span>
            )}
          </div>
          <textarea
            value={noteText}
            onChange={handleTextChange}
            className="w-full min-h-[460px] p-5 text-sm sm:text-base text-slate-800 placeholder:text-slate-400 resize-y focus:outline-none bg-white leading-relaxed font-medium"
            autoFocus
          />
          {saveError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-4 py-2 border-t border-red-100">
              <AlertCircle size={12} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* ── Transactions List (No "AI Extracted Transactions" header) ── */}
        {txList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {txList.map((tx, idx) => {
                const isSent = tx.type === "sent";
                return (
                  <div
                    key={tx.id || idx}
                    className="flex items-center justify-between px-4 py-3 sm:py-3.5 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSent ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                        }`}
                      >
                        {isSent ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{tx.person}</p>
                        {tx.description && (
                          <p className="text-[10px] text-slate-500 truncate">{tx.description}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-sm sm:text-base font-extrabold shrink-0 ml-3 ${
                        isSent ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {isSent ? "-" : "+"}₹{(tx.amount || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Day Total Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs font-bold">
              <div className="flex items-center gap-3 text-slate-500">
                <span>
                  Sent: <span className="text-red-600">{formatINR(note.totalSent || 0)}</span>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Received: <span className="text-emerald-600">{formatINR(note.totalReceived || 0)}</span>
                </span>
              </div>
              {/* Rupee symbol, green if profit, red if loss */}
              <span className={`font-extrabold ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                Net: {isProfit ? "₹" : "-₹"}
                {Math.abs(net).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-[min(95vw,380px)] w-full p-6 border border-slate-200 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-100">
              <Trash2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                Delete Note?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                This will permanently delete this note and all {txList.length} transaction(s).
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
