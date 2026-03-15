"use client";

import React from "react";
import Link from "next/link";
import { FileSpreadsheet, MessageSquare, LayoutGrid, ArrowRight, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { FluxWorkLogo } from "@/components/ui/FluxWorkLogo";

export default function AppHub() {
  const { user, setUser } = useAuthStore();

  if (!user) {
    return <LoadingGrid fullPage size="lg" label="Preparing your workspace..." />;
  }

  async function handleSignOut() {
    await signOut(auth);
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text reveal-content overflow-hidden relative">
      <div className="grid-mesh" />
      <div className="grid-scroll" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 border-b border-sheet-border bg-sheet-bg/80 backdrop-blur-md z-30 flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <FluxWorkLogo size={32} animated />
          <span className="font-bold tracking-tight text-white text-lg">FluxWork Hub</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: user.color || "#4f6ef7" }}
            >
              {user.displayName?.[0] || "?"}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-sheet-muted hover:text-red-400 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/10 border border-transparent hover:border-red-400/20"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-16 px-6 max-w-5xl mx-auto relative z-10">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold mb-3 tracking-tight">Choose your workspace</h1>
          <p className="text-sheet-muted">Select an application to start collaborating with your team.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Spreadsheets Card */}
          <Link 
            href="/dashboard"
            className="group relative h-64 rounded-2xl border border-sheet-border bg-sheet-bg/50 hover:bg-sheet-bg/80 hover:border-sheet-accent/30 hover:shadow-2xl hover:shadow-sheet-accent/5 transition-all duration-300 p-8 flex flex-col justify-between overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileSpreadsheet size={120} />
            </div>
            
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-sheet-accent/10 text-sheet-accent flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <FileSpreadsheet size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Spreadsheets</h2>
              <p className="text-sheet-muted max-w-[240px]">Create, edit and share collaborative spreadsheets in real-time.</p>
            </div>

            <div className="flex items-center gap-2 text-sheet-accent font-semibold group-hover:gap-3 transition-all">
              <span>Enter Workspace</span>
              <ArrowRight size={18} />
            </div>
          </Link>

          {/* Chatbox Card */}
          <Link 
            href="/chatbox"
            className="group relative h-64 rounded-2xl border border-sheet-border bg-sheet-bg/50 hover:bg-sheet-bg/80 hover:border-sheet-accent/30 hover:shadow-2xl hover:shadow-sheet-accent/5 transition-all duration-300 p-8 flex flex-col justify-between overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <MessageSquare size={120} />
            </div>

            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-sheet-accent-dim/10 text-sheet-accent-dim flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <MessageSquare size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Chatbox</h2>
              <p className="text-sheet-muted max-w-[240px]">Real-time communication and team discussion area.</p>
            </div>

            <div className="flex items-center gap-2 text-sheet-accent-dim font-semibold group-hover:gap-3 transition-all italic opacity-60">
              <span>Coming Soon</span>
              <ArrowRight size={18} />
            </div>
          </Link>
        </div>
      </main>

      <style jsx>{`
        .grid-scroll {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 50% 50%, rgba(var(--sheet-accent-rgb), 0.05) 0%, transparent 80%);
          z-index: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
