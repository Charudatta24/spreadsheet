"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, MessageSquare, Ruler, ArrowRight, Settings2, LogOut, Users, UserCircle, X, User, Trash2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { subscribeFriends, subscribeFriendRequests } from "@/lib/firebase/friends";
import type { FriendEntry, FriendRequest } from "@/lib/firebase/friends";

export default function AppHub() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showMeasurementChoice, setShowMeasurementChoice] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeFriends(user.uid, setFriends);
    const u2 = subscribeFriendRequests(user.uid, setRequests);
    return () => { u1(); u2(); };
  }, [user]);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  async function handleSignOut() { await signOut(auth); setUser(null); }

  const incomingCount = requests.filter((r) => r.to === user?.uid).length;

  if (!user) return <LoadingGrid fullPage size="lg" label="Preparing your workspace..." />;

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
      <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />
      <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight text-sheet-text text-lg">Hub</span>
        </div>
        <div className="relative flex items-center gap-2" ref={dropdownRef}>
          <div className="w-8 h-8 rounded-full bg-sheet-accent/15 border border-sheet-border text-sheet-accent text-[11px] font-bold flex items-center justify-center">
            {user.displayName?.[0]?.toUpperCase() ?? "M"}
          </div>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className={`relative flex items-center gap-2 text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border bg-white/60 ${dropdownOpen ? "border-sheet-accent/50 text-sheet-accent" : "border-sheet-border text-sheet-muted hover:text-sheet-accent hover:border-sheet-accent/40"}`}
          >
            <Settings2 size={14} />
            Settings
            {incomingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                {incomingCount}
              </span>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-2 w-60 bg-white rounded-xl border border-sheet-border shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-sheet-border bg-sheet-bg/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-sheet-accent flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {user.displayName?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sheet-text truncate">{user.displayName}</p>
                    {user.nickname && <p className="text-[10px] text-sheet-muted truncate">@{user.nickname}</p>}
                  </div>
                </div>
              </div>
              <Link href="/hub/account" onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center space-x-2 px-4 py-3 hover:bg-sheet-bg text-sm text-sheet-text transition-colors group">
                <div className="w-5 h-5 rounded-full bg-sheet-accent/10 flex items-center justify-center text-sheet-accent"><UserCircle size={12} /></div>
                <span className="font-medium">Account</span>
              </Link>
              <Link href="/hub/friends" onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center space-x-2 px-4 py-3 hover:bg-sheet-bg text-sm text-sheet-text transition-colors group">
                <div className="w-5 h-5 rounded-full bg-sheet-accent/10 flex items-center justify-center text-sheet-accent"><Users size={12} /></div>
                <span className="font-medium">Friends</span>
                <span className="ml-auto text-[10px] font-bold text-red-500">{incomingCount > 0 ? incomingCount : ""}</span>
              </Link>
              {user?.accountType === "owner" && (
                <Link href="/hub/account?tab=trash" onClick={() => setDropdownOpen(false)}
                  className="w-full flex items-center space-x-2 px-4 py-3 hover:bg-amber-50 text-sm text-amber-700 transition-colors group">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><Trash2 size={12} /></div>
                  <span className="font-medium">Deleted Sheets</span>
                </Link>
              )}
              <div className="h-px bg-sheet-border mx-3" />
              <button onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-50 text-sm text-red-500 transition-colors">
                <LogOut size={15} />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="relative z-10 pt-16 pb-16 px-6 max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-3 tracking-tight text-sheet-text">Choose your workspace</h1>
        </div>
        <div className={`grid grid-cols-1 ${user?.accountType === "non-owner" ? "max-w-md mx-auto" : "md:grid-cols-3"} gap-6`}>
          {user?.accountType !== "non-owner" && (
            <>
              <Link href="/dashboard"
                className="group relative h-64 rounded-2xl border border-sheet-border bg-white/60 hover:bg-white hover:border-sheet-accent/30 hover:shadow-2xl transition-all duration-300 p-6 flex flex-col justify-between overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"><FileSpreadsheet size={120} /></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-sheet-accent/10 text-sheet-accent flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300"><FileSpreadsheet size={28} /></div>
                  <h2 className="text-xl font-bold mb-2 text-sheet-text">Spreadsheets</h2>
                </div>
                <div className="flex items-center gap-2 text-sheet-accent font-semibold text-xs group-hover:gap-3 transition-all"><span>Enter Workspace</span><ArrowRight size={16} /></div>
              </Link>
              <Link href="/chatbox"
                className="group relative h-64 rounded-2xl border border-sheet-border bg-white/60 hover:bg-white hover:border-sheet-accent/30 hover:shadow-2xl transition-all duration-300 p-6 flex flex-col justify-between overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"><MessageSquare size={120} /></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-sheet-accent/10 text-sheet-accent flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300"><MessageSquare size={28} /></div>
                  <h2 className="text-xl font-bold mb-2 text-sheet-text">Chatbox</h2>
                </div>
                <div className="flex items-center gap-2 text-sheet-accent font-semibold text-xs group-hover:gap-3 transition-all"><span>Open Chat</span><ArrowRight size={16} /></div>
              </Link>
            </>
          )}
          <div
            onClick={() => {
              if (user?.accountType === "non-owner" && user?.workType) {
                router.push(`/measurement-sheets?type=${user.workType}`);
              } else {
                setShowMeasurementChoice(true);
              }
            }}
            className="group relative h-64 rounded-2xl border border-sheet-border bg-white/60 hover:bg-white hover:border-emerald-500/30 hover:shadow-2xl transition-all duration-300 p-6 flex flex-col justify-between overflow-hidden cursor-pointer"
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"><Ruler size={120} className="text-emerald-600" /></div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300"><Ruler size={28} /></div>
              <h2 className="text-xl font-bold mb-2 text-sheet-text">
                {user?.accountType === "non-owner" && user?.workType === "cutting"
                  ? "Cutting Sheets"
                  : user?.accountType === "non-owner" && user?.workType === "polish"
                  ? "Polish Sheets"
                  : "Measurement Sheets"}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs group-hover:gap-3 transition-all"><span>Open Workspace</span><ArrowRight size={16} /></div>
          </div>
        </div>
      </main>

      {/* Measurement Choice Modal */}
      {showMeasurementChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-sheet-border pb-3">
              <h2 className="text-lg font-bold text-sheet-text flex items-center gap-2">
                <Ruler size={20} className="text-emerald-600" />
                Measurement Sheets
              </h2>
              <button onClick={() => setShowMeasurementChoice(false)} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Show Customer only for Owners or Non-Owners with Polish/No restriction */}
              {user?.accountType !== "non-owner" && (
                <button
                  onClick={() => { setShowMeasurementChoice(false); router.push("/measurement-sheets?type=customer"); }}
                  className="p-5 rounded-2xl border-2 border-sheet-border hover:border-blue-500 hover:bg-blue-50/40 flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users size={24} />
                  </div>
                  <span className="text-sm font-bold text-sheet-text group-hover:text-blue-600">Customer</span>
                </button>
              )}

              {(user?.accountType !== "non-owner" || user?.workType === "polish") && (
                <button
                  onClick={() => { setShowMeasurementChoice(false); router.push("/measurement-sheets?type=polish"); }}
                  className="p-5 rounded-2xl border-2 border-sheet-border hover:border-emerald-500 hover:bg-emerald-50/40 flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User size={24} />
                  </div>
                  <span className="text-sm font-bold text-sheet-text group-hover:text-emerald-600">Polish</span>
                </button>
              )}

              {(user?.accountType !== "non-owner" || user?.workType === "cutting") && (
                <button
                  onClick={() => { setShowMeasurementChoice(false); router.push("/measurement-sheets?type=cutting"); }}
                  className="p-5 rounded-2xl border-2 border-sheet-border hover:border-indigo-500 hover:bg-indigo-50/40 flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Ruler size={24} />
                  </div>
                  <span className="text-sm font-bold text-sheet-text group-hover:text-indigo-600">Cutting</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .grid-mesh { background-image: linear-gradient(rgba(26,115,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,115,232,0.04) 1px, transparent 1px); background-size: 60px 60px; animation: grid-scroll 20s linear infinite; }
        @keyframes grid-scroll { from { background-position: 0 0; } to { background-position: 60px 60px; } }
      `}</style>
    </div>
  );
}
