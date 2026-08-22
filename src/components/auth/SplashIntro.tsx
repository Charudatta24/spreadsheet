"use client";

import React, { useEffect } from "react";

// Total duration matching CSS timeline:
// Word 1 "Measure": 0ms -> 1600ms
// Word 2 "Sheets": 1600ms -> 3200ms
// Tagline & ruler: 2300ms -> 2900ms
// Splash fade out: 3300ms -> 4000ms
const INTRO_DURATION_MS = 4000;

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
        {/* First-time page load title: ONLY "Measure" and "Sheets" zooming in. NO loading cube. */}
        <div className="splash-title-wrapper">
          <span className="splash-word splash-word-1">Measure</span>
          <span className="splash-word splash-word-2">Sheets</span>
        </div>

        {/* Decorative ruler line */}
        <div className="splash-ruler-line" />

        {/* Tagline */}
        <p className="splash-tagline">Precision in Every Measurement</p>
      </div>
    </div>
  );
}
