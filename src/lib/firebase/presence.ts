import {
  ref,
  set,
  onDisconnect,
  onValue,
  off,
  serverTimestamp,
  remove,
} from "firebase/database";
import { rtdb } from "./client";
import type { PresenceUser, CellId } from "@/types";

const PRESENCE_ROOT = "presence";
const HEARTBEAT_INTERVAL = 15_000; // 15s
const STALE_THRESHOLD = 30_000;    // 30s - consider user offline

// ─── Join / Leave ─────────────────────────────────────────────────────────────

export function joinDocument(
  docId: string,
  user: PresenceUser
): () => void {
  const userRef = ref(rtdb, `${PRESENCE_ROOT}/${docId}/${user.uid}`);

  const data = {
    uid: user.uid,
    displayName: user.displayName,
    color: user.color,
    focusedCell: user.focusedCell ?? null,
    lastSeen: Date.now(),
  };

  set(userRef, data).catch(console.error);

  // Auto-remove on disconnect
  onDisconnect(userRef).remove().catch(console.error);

  // Heartbeat to keep presence alive
  const interval = setInterval(() => {
    set(ref(rtdb, `${PRESENCE_ROOT}/${docId}/${user.uid}/lastSeen`), Date.now())
      .catch(console.error);
  }, HEARTBEAT_INTERVAL);

  return () => {
    clearInterval(interval);
    remove(userRef).catch(console.error);
  };
}

export function updateFocusedCell(
  docId: string,
  uid: string,
  cellId: CellId | null
): void {
  set(
    ref(rtdb, `${PRESENCE_ROOT}/${docId}/${uid}/focusedCell`),
    cellId
  ).catch(console.error);
}

// ─── Subscribe to presence ────────────────────────────────────────────────────

export function subscribePresence(
  docId: string,
  callback: (users: PresenceUser[]) => void
): () => void {
  const presenceRef = ref(rtdb, `${PRESENCE_ROOT}/${docId}`);

  const handler = onValue(presenceRef, (snap) => {
    const now = Date.now();
    const users: PresenceUser[] = [];

    if (snap.exists()) {
      snap.forEach((child) => {
        const data = child.val() as PresenceUser & { lastSeen: number };
        // Filter out stale users
        if (now - data.lastSeen < STALE_THRESHOLD) {
          users.push({
            uid: data.uid,
            displayName: data.displayName,
            color: data.color,
            focusedCell: data.focusedCell ?? undefined,
            lastSeen: data.lastSeen,
          });
        }
      });
    }

    callback(users);
  });

  return () => off(presenceRef, "value", handler);
}
