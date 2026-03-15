"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { setUserProfile, isNicknameTaken } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";

/**
 * Displays the user's nickname with a pencil-icon on hover.
 * Click → inline input → Save / Cancel.
 * Persists to Firestore and updates the auth store on save.
 */
export function EditableNickname({ className }: { className?: string }) {
  const { user, setUser } = useAuthStore();
  const nickname = user?.nickname ?? user?.displayName ?? "";

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local value in sync when store changes
  useEffect(() => {
    if (!editing) setValue(nickname);
  }, [nickname, editing]);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || !user) { setEditing(false); return; }
    if (trimmed === nickname) { setEditing(false); return; }

    setSaving(true);
    try {
      const taken = await isNicknameTaken(trimmed, user.uid);
      if (taken) {
        alert("This nickname is already taken!");
        setSaving(false);
        return;
      }

      await setUserProfile(user.uid, {
        displayName: user.displayName,
        email: user.email,
        nickname: trimmed
      });
      setUser({ ...user, nickname: trimmed });
      setEditing(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update nickname.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(nickname);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          maxLength={32}
          disabled={saving}
          className="bg-sheet-bg border border-sheet-accent rounded px-1.5 py-0.5 text-xs font-medium text-sheet-text outline-none w-32 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          title="Save nickname"
          className="p-0.5 rounded text-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          <Check size={12} />
        </button>
        <button
          onClick={handleCancel}
          title="Cancel"
          className="p-0.5 rounded text-sheet-muted hover:bg-sheet-border transition-colors"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit nickname"
      className={`group flex items-center gap-1 text-xs font-medium text-sheet-muted hover:text-sheet-accent transition-colors ${className ?? ""}`}
    >
      <span>{nickname}</span>
      <Pencil
        size={10}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </button>
  );
}
