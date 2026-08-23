"use client";

import React, { useEffect } from "react";

// Total duration matching CSS timeline (2.5 seconds total):
// Word 1 "Measure": 0ms -> 800ms
// Word 2 "Sheets": 800ms -> 1600ms
// Ruler & Tagline: 1400ms -> 2200ms
// Splash fade out: 2000ms -> 2500ms
const INTRO_DURATION_MS = 2500;

interface SplashIntroProps {
  onComplete: () => void;
}

export function SplashIntro({ onComplete }: SplashIntroProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="splash-screen">
      {/* Animated background grid */}
      <div className="grid-mesh" />

      <div className="splash-content">
        {/* Pre-login title: Measure Sheets zooming in */}
        <div className="splash-title-wrapper">
          <span className="splash-word splash-word-1">Measure</span>
          <span className="splash-word splash-word-2">Sheets</span>
        </div>

        {/* Decorative ruler line */}
        <div className="splash-ruler-line" />

        {/* Tagline: Precision in Every Measurement */}
        <p className="splash-tagline">Precision in Every Measurement</p>
      </div>
    </div>
  );
}
