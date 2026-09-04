"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Trash2,
  X,
  Loader2,
  Calendar,
  Plus,
  StickyNote,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import {
  createAccountingNote,
  deleteAccountingNote,
  subscribeAccountingNotes,
} from "@/lib/firebase/firestore";
import {
  formatINR,
  round2,
} from "@/lib/accountingExport";
import type { AccountingNote, AccountingTransaction } from "@/types";

export default function AccountingPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [notes, setNotes] = useState<AccountingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNoteDate, setNewNoteDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [createModalError, setCreateModalError] = useState("");
  const [existingNoteMatch, setExistingNoteMatch] = useState<AccountingNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingNote, setDeletingNote] = useState<AccountingNote | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeAccountingNotes(user.uid, (data) => {
      setNotes(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Search results — per-transaction with person grouping
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return null;

    const matchingTx: (AccountingTransaction & { noteDate: string })[] = [];
    notes.forEach((n) => {
      (n.transactions || []).forEach((t) => {
        if (
          t.person.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.originalText.toLowerCase().includes(q)
        ) {
          matchingTx.push({ ...t, noteDate: n.date });
        }
      });
    });

    let totalSent = 0;
    let totalReceived = 0;
    matchingTx.forEach((t) => {
      if (t.type === "sent") totalSent = round2(totalSent + (t.amount || 0));
      else totalReceived = round2(totalReceived + (t.amount || 0));
    });
    const net = round2(totalReceived - totalSent);

    return { transactions: matchingTx, totalSent, totalReceived, net };
  }, [searchQuery, notes]);

  function getNoteExpiry(note: AccountingNote): { label: string; urgent: boolean } {
    try {
      const expiresAt =
        note.expiresAt ||
        (note.createdAt ? note.createdAt + 5 * 30 * 24 * 60 * 60 * 1000 : Date.now() + 5 * 30 * 24 * 60 * 60 * 1000);
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

  function formatDateCard(dateStr: string) {
    try {
      const d = new Date(dateStr + "T00:00:00");
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const day = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const weekday = d.toLocaleDateString("en-IN", { weekday: "short" });
      if (dateStr === today) return { day, weekday, badge: "Today" };
      if (dateStr === yesterday) return { day, weekday, badge: "Yesterday" };
      return { day, weekday, badge: null };
    } catch {
      return { day: dateStr, weekday: "", badge: null };
    }
  }

  async function handleCreateNote() {
    if (!user || !newNoteDate) return;

    // Check if a note for this date is already created
    const existing = notes.find((n) => n.date === newNoteDate);
    if (existing) {
      setCreateModalError("A note for this date is already created.");
      setExistingNoteMatch(existing);
      return;
    }

    setIsCreating(true);
    setCreateModalError("");
    setExistingNoteMatch(null);
    try {
      const note = await createAccountingNote(user.uid, {
        date: newNoteDate,
        content: "",
        transactions: [],
        totalSent: 0,
        totalReceived: 0,
      });
      setShowCreateModal(false);
      router.push(`/accounting/${note.id}`);
    } catch (err) {
      console.error(err);
      setCreateModalError("Failed to create note. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingNote || !user) return;
    try {
      await deleteAccountingNote(user.uid, deletingNote.id);
      setDeletingNote(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete note.");
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-sm w-full">
          <BookOpen className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2 font-['Cinzel','Playfair_Display',serif]">
            Personal Accounting Notepad
          </h2>
          <p className="text-xs text-slate-500 mb-6">Please sign in to access your personal accounting notes.</p>
          <Link
            href="/"
            className="block w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 overflow-x-hidden pb-24">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur-md flex items-center px-4 sm:px-6 justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/hub"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            title="Back to Hub"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-extrabold tracking-wide uppercase text-base sm:text-lg font-['Cinzel','Playfair_Display',serif]">
              <span className="text-slate-900">AI </span>
              <span className="text-blue-600">Accounting</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNewNoteDate(new Date().toISOString().split("T")[0]);
              setCreateModalError("");
              setExistingNoteMatch(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-600/20"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Note</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <main className="pt-4 sm:pt-6 px-3 sm:px-6 max-w-5xl mx-auto space-y-5">
        {/* ── Search Bar ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by person..."
              className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── WHEN SEARCHING: Show ONLY the Person's Transactions (Notes Disappear) ── */}
        {searchQuery.trim() ? (
          searchResults && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in">
              {/* Overall Totals for this Person */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <h3 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                    &ldquo;{searchQuery}&rdquo;
                  </h3>
                  <span className="text-xs text-slate-400 ml-auto font-medium">
                    {searchResults.transactions.length} transaction{searchResults.transactions.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Net: Rupee symbol, green if profit, red if loss */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="bg-red-50/70 p-3 rounded-xl border border-red-100">
                    <p className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Total Sent</p>
                    <p className="text-base font-extrabold text-red-600 mt-0.5">
                      {formatINR(searchResults.totalSent)}
                    </p>
                  </div>
                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                    <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Total Received</p>
                    <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                      {formatINR(searchResults.totalReceived)}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-xl border ${
                      searchResults.net >= 0
                        ? "bg-emerald-50/70 border-emerald-200"
                        : "bg-red-50/70 border-red-200"
                    }`}
                  >
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Net</p>
                    <p
                      className={`text-base font-extrabold mt-0.5 ${
                        searchResults.net >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {searchResults.net >= 0 ? "₹" : "-₹"}
                      {Math.abs(searchResults.net).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Individual Transactions for this Person */}
              {searchResults.transactions.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] uppercase font-bold text-slate-400 pb-1">
                    Transactions with {searchQuery}
                  </p>
                  {searchResults.transactions.map((tx, idx) => {
                    const isSent = tx.type === "sent";
                    return (
                      <div
                        key={tx.id || idx}
                        className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isSent ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                            }`}
                          >
                            {isSent ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{tx.person}</p>
                            <p className="text-[11px] text-slate-500">
                              {new Date(tx.noteDate + "T00:00:00").toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              {tx.description && ` · ${tx.description}`}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-sm sm:text-base font-extrabold shrink-0 ${
                            isSent ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {isSent ? "-" : "+"}₹{(tx.amount || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">
                  No transactions found for &ldquo;{searchQuery}&rdquo;.
                </p>
              )}
            </div>
          )
        ) : (
          /* ── WHEN NOT SEARCHING: Show Normal Notes Grid ── */
          loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <p className="text-xs text-slate-500">Loading your accounting notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1">
                <StickyNote size={28} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                No Accounting Notes Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Create your first note. Each note is dated — tap the card to open and write your transactions.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewNoteDate(new Date().toISOString().split("T")[0]);
                  setCreateModalError("");
                  setExistingNoteMatch(null);
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
              >
                <Plus size={15} />
                <span>Create Today&apos;s Note</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => {
                const { day, weekday, badge } = formatDateCard(note.date);
                const net = round2((note.totalReceived || 0) - (note.totalSent || 0));
                const isProfit = net >= 0;
                const txCount = note.transactions?.length || 0;
                const expiry = getNoteExpiry(note);

                return (
                  <div
                    key={note.id}
                    onClick={() => router.push(`/accounting/${note.id}`)}
                    className="group relative bg-white border border-slate-200 hover:border-blue-400/60 rounded-2xl p-4 sm:p-5 cursor-pointer hover:shadow-lg transition-all duration-200 flex flex-col gap-3"
                  >
                    {/* Header: Date + Badges + Timer + Delete Button */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Calendar size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {day}
                            </h3>
                            {badge && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                {badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {weekday} · {txCount} transaction{txCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      {/* Timer & Delete Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            expiry.urgent
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-blue-50 text-blue-600 border-blue-200/60"
                          }`}
                          title="5-Month auto-deletion timer"
                        >
                          <Clock size={10} className={expiry.urgent ? "text-red-500" : "text-blue-500"} />
                          <span>{expiry.label}</span>
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingNote(note);
                          }}
                          className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all"
                          title="Delete Note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Financial Summary — Rupee symbol, green if profit, red if loss */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-red-50 rounded-xl p-2 border border-red-100/60">
                        <p className="text-[9px] uppercase font-bold text-red-400">Sent</p>
                        <p className="text-xs font-extrabold text-red-600 mt-0.5">
                          {formatINR(note.totalSent || 0)}
                        </p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100/60">
                        <p className="text-[9px] uppercase font-bold text-emerald-500">Recv</p>
                        <p className="text-xs font-extrabold text-emerald-600 mt-0.5">
                          {formatINR(note.totalReceived || 0)}
                        </p>
                      </div>
                      <div
                        className={`rounded-xl p-2 border ${
                          isProfit ? "bg-emerald-50/60 border-emerald-200/60" : "bg-red-50/60 border-red-200/60"
                        }`}
                      >
                        <p className="text-[9px] uppercase font-bold text-slate-500">Net</p>
                        <p
                          className={`text-xs font-extrabold mt-0.5 ${
                            isProfit ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {isProfit ? "₹" : "-₹"}
                          {Math.abs(net).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>

      {/* ── Create Note Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calendar size={18} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                    New Account Note
                  </h2>
                  <p className="text-[10px] text-slate-400">Select the date for this note</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Date</label>
                <input
                  type="date"
                  value={newNoteDate}
                  onChange={(e) => {
                    setNewNoteDate(e.target.value);
                    setCreateModalError("");
                    setExistingNoteMatch(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                  autoFocus
                />
              </div>

              {createModalError && (
                <div className="flex flex-col gap-1.5 text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0 text-red-600" />
                    <span className="font-semibold">{createModalError}</span>
                  </div>
                  {existingNoteMatch && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        router.push(`/accounting/${existingNoteMatch.id}`);
                      }}
                      className="text-left text-blue-600 font-bold hover:underline pl-6"
                    >
                      Open this note →
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreating || !newNoteDate}
                onClick={handleCreateNote}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isCreating ? <Loader2 size={15} className="animate-spin" /> : null}
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deletingNote && (
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
                This will permanently delete the note for{" "}
                <span className="font-bold text-slate-800">{formatDateCard(deletingNote.date).day}</span> and all{" "}
                {deletingNote.transactions?.length || 0} transaction(s) in it.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeletingNote(null)}
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
