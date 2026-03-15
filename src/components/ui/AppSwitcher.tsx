"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, FileSpreadsheet, MessageSquare, LayoutGrid, Check } from "lucide-react";
import { FluxWorkLogo } from "./FluxWorkLogo";

interface AppSwitcherProps {
  currentApp: "spreadsheets" | "chatbox";
}

export function AppSwitcher({ currentApp }: AppSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const apps = [
    {
      id: "spreadsheets",
      name: "Spreadsheets",
      href: "/dashboard",
      icon: FileSpreadsheet,
      color: "text-sheet-accent",
      bgColor: "bg-sheet-accent/10",
    },
    {
      id: "chatbox",
      name: "Chatbox",
      href: "/chatbox",
      icon: MessageSquare,
      color: "text-sheet-accent-dim",
      bgColor: "bg-sheet-accent-dim/10",
      isComingSoon: true,
    },
  ];

  const activeApp = apps.find((app) => app.id === currentApp) || apps[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-sheet-border transition-all text-sm font-medium group"
      >
        <div className={`w-6 h-6 rounded flex items-center justify-center ${activeApp.bgColor} ${activeApp.color}`}>
          <activeApp.icon size={14} />
        </div>
        <span>App Hub</span>
        <ChevronDown 
          size={14} 
          className={`text-sheet-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} 
        />
      </button>

      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-1 w-64 bg-sheet-surface border border-sheet-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-2 border-b border-sheet-border bg-sheet-bg/50">
            <span className="text-[10px] font-bold text-sheet-muted uppercase tracking-widest px-2">Switch Application</span>
          </div>
          
          <div className="p-1">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={app.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                  app.id === currentApp 
                    ? "bg-sheet-accent/5 pointer-events-none" 
                    : "hover:bg-sheet-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${app.bgColor} ${app.color}`}>
                    <app.icon size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-semibold ${app.id === currentApp ? "text-sheet-accent" : "text-sheet-text"}`}>
                      {app.name}
                    </span>
                    {app.isComingSoon && (
                      <span className="text-[10px] text-sheet-accent-dim italic">Coming Soon</span>
                    )}
                  </div>
                </div>
                {app.id === currentApp && (
                  <Check size={16} className="text-sheet-accent" />
                )}
              </Link>
            ))}
          </div>

          <Link
            href="/hub"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 p-3 bg-sheet-bg hover:bg-sheet-border border-t border-sheet-border transition-colors text-xs font-medium text-sheet-muted"
          >
            <FluxWorkLogo size={14} animated />
            Back to Hub
          </Link>
        </div>
      )}
    </div>
  );
}
