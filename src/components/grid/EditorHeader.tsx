"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Check, Loader2, AlertCircle, Clock, UserPlus, LayoutGrid } from "lucide-react";
import { useEditorStore } from "@/lib/sync/store";
import { useAuthStore } from "@/lib/sync/authStore";
import { dispatchTitleWrite } from "@/hooks/useDocumentSync";
import { PresenceBar } from "@/components/presence/PresenceBar";
import { EditableNickname } from "@/components/auth/EditableNickname";
import { AppSwitcher } from "@/components/ui/AppSwitcher";
import { downloadCSV } from "@/lib/export";
import { DEFAULT_COLS, DEFAULT_ROWS } from "@/lib/sync/store";
import { ShareModal } from "./ShareModal";

export function EditorHeader({ 
  docId, 
  onToggleChat, 
  unreadCount,
  onSelectTarget,
  unreadDmUids = []
}: { 
  docId: string; 
  onToggleChat: () => void; 
  unreadCount: number;
  onSelectTarget: (uid: string | null) => void;
  unreadDmUids?: string[];
}) {
  const router = useRouter();
  const { title, ownerId, setTitle, saveState, cells, colWidths, rowHeights } = useEditorStore();
  const { user } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [showShare, setShowShare] = useState(false);
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
      participants: [user?.uid ?? ""],
      invitedUsers: [],
      acceptedUsers: [user?.uid ?? ""],
      cells,
      colWidths,
      rowHeights,
    };
    downloadCSV(doc, DEFAULT_ROWS, DEFAULT_COLS);
  }

  return (
    <header className="h-12 border-b border-sheet-border bg-sheet-surface relative shrink-0 flex items-center gap-2 px-3 sm:px-4">
      {/* Left: Navigation Actions */}
      <div className="flex items-center gap-1.5 z-10">
        <button
          onClick={() => router.push("/dashboard")}
          className="group p-1.5 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
          title="Back to spreadsheet list"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Center: Title & Status (Absolutely centered) */}
      <div className="flex-1 min-w-0 flex justify-center">
        <div className="flex flex-col items-center min-w-0">
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
              className="bg-sheet-bg border border-sheet-accent rounded px-3 py-0.5 text-sm font-bold text-sheet-text text-center outline-none w-full max-w-[18rem] shadow-lg shadow-sheet-accent/10"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="group flex min-w-0 items-center gap-2 text-sm font-bold text-sheet-text hover:text-sheet-accent transition-colors truncate"
            >
              <span className="truncate max-w-[200px] lg:max-w-xs">{localTitle || "Untitled Spreadsheet"}</span>
              <div className="w-4 h-4 rounded bg-sheet-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Check size={10} className="text-sheet-muted" />
              </div>
            </button>
          )}
          <SaveIndicator state={saveState} />
        </div>
      </div>

      {/* Right: Tools & Collab */}
      <div className="flex-1" />

      <div className="flex items-center gap-2 z-10">
        <PresenceBar 
          onToggleChat={onToggleChat} 
          unreadCount={unreadCount} 
          onSelectTarget={onSelectTarget}
          unreadDmUids={unreadDmUids}
        />

        <div className="w-px h-5 bg-sheet-border mx-1" />

        {user?.uid === ownerId && (
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sheet-accent hover:bg-sheet-accent-dim text-white text-xs font-bold rounded-lg transition-all shadow-md active:scale-95 border border-white/10"
          >
            <UserPlus size={14} />
            Share
          </button>
        )}

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 text-xs text-sheet-muted hover:text-sheet-text px-2 py-1.5 rounded hover:bg-sheet-border transition-colors border border-transparent hover:border-sheet-border"
        >
          <Download size={14} />
          <span className="hidden lg:inline">Export</span>
        </button>
      </div>

      {showShare && (
        <ShareModal 
          docId={docId} 
          onClose={() => setShowShare(false)} 
        />
      )}
    </header>
  );
}

function SaveIndicator({ state }: { state: string }) {
  if (state === "saved") {
    return (
      <div className="flex items-center gap-1 text-xs text-blue-500">
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
