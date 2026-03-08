"use client";

import { useEffect } from "react";
import { joinDocument, updateFocusedCell, subscribePresence } from "@/lib/firebase/presence";
import { useEditorStore } from "@/lib/sync/store";
import { useAuthStore } from "@/lib/sync/authStore";

export function usePresence(docId: string): void {
  const { user } = useAuthStore();
  const { setPresenceUsers, activeCell } = useEditorStore();

  // Join presence on mount
  useEffect(() => {
    if (!user) return;

    const leave = joinDocument(docId, {
      uid: user.uid,
      displayName: user.displayName,
      color: user.color,
      lastSeen: Date.now(),
    });

    const unsub = subscribePresence(docId, setPresenceUsers);

    return () => {
      leave();
      unsub();
    };
  }, [docId, user, setPresenceUsers]);

  // Broadcast focused cell changes
  useEffect(() => {
    if (!user) return;
    updateFocusedCell(docId, user.uid, activeCell);
  }, [docId, user, activeCell]);
}