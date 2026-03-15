"use client";

import React from "react";

interface LoadingGridProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
  fullPage?: boolean;
}

export function LoadingGrid({ size = "md", className = "", label, fullPage }: LoadingGridProps) {
  const dimensions = {
    sm: { gap: 2, box: 6, container: 24 },
    md: { gap: 3, box: 8, container: 32 },
    lg: { gap: 4, box: 12, container: 48 },
  }[size];

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div 
        className="grid grid-cols-3" 
        style={{ 
          gap: `${dimensions.gap}px`,
          width: `${dimensions.container}px`,
          height: `${dimensions.container}px`
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="bg-sheet-accent rounded-[1.5px] shadow-sm"
            style={{
              width: `${dimensions.box}px`,
              height: `${dimensions.box}px`,
              animation: `grid-pulse 1.4s infinite ease-in-out`,
              animationDelay: `${(i % 3 + Math.floor(i / 3)) * 0.15}s`,
              opacity: 0.2
            }}
          />
        ))}
      </div>
      {label && <span className="text-sm font-semibold text-sheet-accent/70 tracking-tight animate-pulse">{label}</span>}
    </div>
  );

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
