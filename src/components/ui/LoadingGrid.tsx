"use client";

import React from "react";

interface LoadingGridProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
  fullPage?: boolean;
  /** Renders as a fixed overlay with backdrop-blur over the current page */
  overlay?: boolean;
}

export function LoadingGrid({ size = "md", className = "", label, fullPage, overlay }: LoadingGridProps) {
  // Small inline spinner mode (e.g. inside buttons / small cards)
  if (size === "sm" && !fullPage && !overlay) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="sk-folding-cube !w-5 !h-5">
          <div className="sk-cube1 sk-cube" />
          <div className="sk-cube2 sk-cube" />
          <div className="sk-cube4 sk-cube" />
          <div className="sk-cube3 sk-cube" />
        </div>
      </div>
    );
  }

  // Loading content: "Measure [spinner] Sheets"
  const content = (
    <div className={`flex flex-col items-center justify-center gap-5 ${className}`}>
      <div className="splash-title-wrapper">
        <span className="splash-word-static-1">Measure</span>

        <div className="mx-2 flex items-center justify-center">
          <div className="sk-folding-cube !w-5 !h-5">
            <div className="sk-cube1 sk-cube" />
            <div className="sk-cube2 sk-cube" />
            <div className="sk-cube4 sk-cube" />
            <div className="sk-cube3 sk-cube" />
          </div>
        </div>

        <span className="splash-word-static-2">Sheets</span>
      </div>

      {label && (
        <span className="text-xs font-semibold text-sheet-accent/70 tracking-widest uppercase animate-pulse">
          {label}
        </span>
      )}
    </div>
  );

  // Overlay mode: blurred backdrop over current page, loading centered on top (no box)
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm bg-white/40">
        {content}
      </div>
    );
  }

  // Full-page mode: replaces the screen (used only for unauthenticated states)
  if (fullPage) {
    return (
      <div className="loading-background overflow-hidden">
        <div className="grid-mesh" />
        {content}
      </div>
    );
  }

  return content;
}
