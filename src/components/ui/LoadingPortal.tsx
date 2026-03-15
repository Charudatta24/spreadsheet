"use client";

import React from "react";
import { FluxWorkLogo } from "./FluxWorkLogo";

interface LoadingPortalProps {
  fullPage?: boolean;
}

export function LoadingPortal({ fullPage = false }: LoadingPortalProps) {
  return (
    <div className={`
      ${fullPage ? "fixed inset-0 z-[100] bg-sheet-bg" : "relative w-full h-full p-12"}
      flex flex-col items-center justify-center overflow-hidden
    `}>
      {/* Signature Scene - No background animation or extra text */}
      <div className="relative flex flex-col items-center">
        <div className="relative z-10">
          {/* Subtle glow centered on the logo */}
          <div className="absolute inset-0 bg-sheet-accent rounded-full blur-[120px] opacity-10 animate-pulse" />
          
          <div className="relative p-12">
            <FluxWorkLogo size={180} animated />
          </div>
        </div>
      </div>
    </div>
  );
}
