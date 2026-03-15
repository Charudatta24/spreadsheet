"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { MessageSquare, ArrowLeft, Construction } from "lucide-react";
import { LoadingChatbox } from "@/components/ui/LoadingChatbox";

export default function ChatboxPlaceholder() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <LoadingChatbox fullPage label="Connecting to chat stream..." />;
  }

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text flex flex-col items-center justify-center p-6 text-center reveal-content">
      <div className="grid-mesh" />
      
      <div className="w-20 h-20 rounded-2xl bg-sheet-accent/10 text-sheet-accent flex items-center justify-center mb-8 animate-pulse">
        <MessageSquare size={40} />
      </div>

      <div className="flex items-center gap-2 mb-4 px-3 py-1 bg-sheet-accent/5 border border-sheet-accent/10 rounded-full text-sheet-accent text-xs font-bold tracking-widest uppercase">
        <Construction size={14} />
        Under Construction
      </div>

      <h1 className="text-4xl font-bold mb-4 tracking-tight">Chatbox is coming soon</h1>
      <p className="text-sheet-muted max-w-md mb-12">
        We're building a powerful real-time communication platform to help your team discuss data and collaborate even faster.
      </p>

      <Link 
        href="/hub"
        className="flex items-center gap-2 px-6 py-3 bg-sheet-accent hover:bg-sheet-accent-dim text-white rounded-xl font-medium transition-all hover:gap-3 shadow-lg shadow-sheet-accent/20"
      >
        <ArrowLeft size={18} />
        Back to App Hub
      </Link>
    </div>
  );
}
