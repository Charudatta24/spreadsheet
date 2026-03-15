"use client";

import React from "react";
import { MessageSquare } from "lucide-react";

interface LoadingChatboxProps {
  fullPage?: boolean;
  label?: string;
}

export function LoadingChatbox({ fullPage = false, label = "Loading messages..." }: LoadingChatboxProps) {
  const bubbles = Array.from({ length: 6 });

  const content = (
    <div className="flex flex-col items-center justify-center p-8 space-y-8 max-w-md w-full">
      {/* Icon with orbital pulse */}
      <div className="relative">
        <div className="absolute inset-0 bg-sheet-accent/20 rounded-full blur-2xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-2xl bg-sheet-accent/10 border border-sheet-accent/20 flex items-center justify-center text-sheet-accent animate-bounce">
          <MessageSquare size={32} />
        </div>
      </div>

      {/* Simulated Message Stream */}
      <div className="w-full space-y-4">
        {bubbles.map((_, i) => (
          <div 
            key={i}
            className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"} w-full`}
          >
            <div 
              className={`
                h-10 rounded-2xl animate-pulse
                ${i % 2 === 0 ? "bg-sheet-accent/10 w-2/3" : "bg-sheet-border w-1/2"}
              `}
              style={{ 
                animationDelay: `${i * 0.15}s`,
                opacity: 0.2 + (i * 0.1) 
              }}
            />
          </div>
        ))}
      </div>

      {label && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-bold text-sheet-accent tracking-widest uppercase animate-pulse">
            {label}
          </span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-sheet-accent/40 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-sheet-accent/40 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-sheet-accent/40 animate-bounce" />
          </div>
        </div>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sheet-bg overflow-hidden">
        <div className="grid-mesh opacity-30" />
        <div className="reveal-content w-full flex justify-center">
          {content}
        </div>
      </div>
    );
  }

  return content;
}
