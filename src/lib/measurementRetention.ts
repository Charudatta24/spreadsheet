import { addMonths } from "date-fns";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/** How long owner-created measurement sheets are kept before permanent deletion */
export const SHEET_RETENTION_MONTHS = 2;

/** sessionStorage key — set on fresh Google login, consumed by the notice modal */
export const OWNER_RETENTION_NOTICE_KEY = "measuresheets-owner-retention-notice";

export function getAutoDeleteDate(from: Date = new Date()): Date {
  return addMonths(from, SHEET_RETENTION_MONTHS);
}

export function getAutoDeleteTimestamp(from: Date = new Date()): Timestamp {
  return Timestamp.fromDate(getAutoDeleteDate(from));
}

function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && !isNaN(value)) return value;
  const anyVal = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof anyVal.toMillis === "function") {
    try {
      return anyVal.toMillis();
    } catch {
      /* ignore */
    }
  }
  if (typeof anyVal.toDate === "function") {
    try {
      const d = anyVal.toDate();
      const t = d?.getTime?.();
      return typeof t === "number" && !isNaN(t) ? t : null;
    } catch {
      /* ignore */
    }
  }
  const parsed = new Date(value as string | number | Date).getTime();
  return isNaN(parsed) ? null : parsed;
}

/** True when a sheet has passed its 2-month retention window */
export function isSheetPastRetention(sheet: {
  autoDeleteAt?: unknown;
  createdAt?: unknown;
}): boolean {
  const now = Date.now();
  const autoAt = toMillis(sheet.autoDeleteAt);
  if (autoAt != null) return now >= autoAt;

  const created = toMillis(sheet.createdAt);
  if (created != null) {
    return now >= getAutoDeleteDate(new Date(created)).getTime();
  }
  return false;
}

/**
 * Permanently delete all measurement sheets owned by `uid` that are older than
 * the 2-month retention period. Returns how many were deleted.
 */
export async function purgeExpiredOwnerSheets(uid: string): Promise<number> {
  const q = query(collection(db, "measurementSheets"), where("userId", "==", uid));
  const snap = await getDocs(q);
  const expired = snap.docs.filter((d) => isSheetPastRetention(d.data()));
  await Promise.all(expired.map((d) => deleteDoc(d.ref).catch(() => undefined)));
  return expired.length;
}

export function markOwnerRetentionNoticePending(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(OWNER_RETENTION_NOTICE_KEY, "1");
}

export function consumeOwnerRetentionNoticePending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const pending = sessionStorage.getItem(OWNER_RETENTION_NOTICE_KEY) === "1";
  if (pending) sessionStorage.removeItem(OWNER_RETENTION_NOTICE_KEY);
  return pending;
}

export function peekOwnerRetentionNoticePending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(OWNER_RETENTION_NOTICE_KEY) === "1";
}

export function clearOwnerRetentionNoticePending(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(OWNER_RETENTION_NOTICE_KEY);
}
