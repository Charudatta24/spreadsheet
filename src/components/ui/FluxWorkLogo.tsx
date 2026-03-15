"use client";

import React from "react";
import Image from "next/image";

interface FluxWorkLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export function FluxWorkLogo({ 
  className = "", 
  size = 120, 
  animated = false 
}: FluxWorkLogoProps) {
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ 
        width: size, 
        height: size,
        // Using 'multiply' for the cleanest white-on-white blend.
        // We boost brightness slightly to ensure any off-white noise in the image
        // background is pushed to absolute white (#FFFFFF).
        mixBlendMode: "multiply",
        filter: "brightness(1.1) contrast(1.02)"
      }}
    >
      <div className={`relative w-full h-full ${animated ? "animate-logo-reveal" : ""}`}>
        <Image
          src="/logo_flux_latest.png"
          alt="FluxWork Logo"
          fill
          className="object-contain pointer-events-none select-none"
          priority
        />
      </div>

      <style jsx>{`
        @keyframes logo-reveal {
          0% { 
            opacity: 0; 
            transform: scale(0.95); 
          }
          100% { 
            opacity: 1; 
            transform: scale(1); 
          }
        }
        .animate-logo-reveal {
          animation: logo-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}