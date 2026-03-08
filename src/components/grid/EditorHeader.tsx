"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Check, Loader2, AlertCircle, Clock } from "lucide-react";
import { useEditorStore } from "@/lib/sync/store";
import { useAuthStore } from "@/lib/sync/authStore";
import { dispatchTitleWrite } from "@/hooks/useDocumentSync";
import { PresenceBar } from "@/components/presence/PresenceBar";
import { downloadCSV } from "@/lib/export";
import { DEFAULT_COLS, DEFAULT_ROWS } from "@/lib/sync/store";

export function EditorHeader({ docId }: { docId: string }) {
  const router = useRouter();
  const { title, setTitle, saveState, cells, colWidths, rowHeights } = useEditorStore();
  const { user } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  function handleTitleBlur() {
    setEditing(false);
    const t = localTitle.trim() || "Untitled Spreadsheet";
    setLocalTitle(t);
    setTitle(t);
    dispatchTitleWrite(t);
  }

  function handleExportCSV() {
    const doc = {
      id: docId,
      title: localTitle,
      ownerId: user?.uid ?? "",
      ownerName: user?.displayName ?? "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cells,
      colWidths,
      rowHeights,
    };
    downloadCSV(doc, DEFAULT_ROWS, DEFAULT_COLS);
  }

  return (
    <header className="flex items-center h-12 px-3 border-b border-sheet-border bg-sheet-surface gap-2 shrink-0">
      <button
        onClick={() => router.push("/dashboard")}
        className="p-1.5 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") inputRef.current?.blur();
            if (e.key === "Escape") {
              setLocalTitle(title);
              setEditing(false);
            }
          }}
          autoFocus
          className="bg-sheet-bg border border-sheet-accent rounded px-2 py-0.5 text-sm font-medium text-sheet-text outline-none min-w-0 w-48"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-sheet-text hover:text-white px-1 rounded hover:bg-sheet-border transition-colors truncate max-w-xs"
        >
          {localTitle || "Untitled Spreadsheet"}
        </button>
      )}

      {/* Save indicator */}
      <SaveIndicator state={saveState} />

      <div className="flex-1" />

      {/* Presence */}
      <PresenceBar />

      {/* Export */}
      <button
        onClick={handleExportCSV}
        className="flex items-center gap-1.5 text-xs text-sheet-muted hover:text-sheet-text px-2 py-1.5 rounded hover:bg-sheet-border transition-colors"
      >
        <Download size={14} />
        Export CSV
      </button>
    </header>
  );
}

function SaveIndicator({ state }: { state: string }) {
  if (state === "saved") {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-400">
        <Check size={12} />
        Saved
      </div>
    );
  }
  if (state === "saving" || state === "pending") {
    return (
      <div className="flex items-center gap-1 text-xs text-sheet-muted saving-pulse">
        <Loader2 size={12} className="animate-spin" />
        Saving…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-1 text-xs text-red-400">
        <AlertCircle size={12} />
        Error saving
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-sheet-muted">
      <Clock size={12} />
    </div>
  );
}
