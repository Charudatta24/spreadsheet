import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  writeBatch,
  limit,
  where,
  arrayUnion,
  arrayRemove,
  addDoc,
  orderBy,
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { db, rtdb } from "./client";
import type {
  SheetDocument,
  DocumentMeta,
  CellId,
  CellData,
  ColWidths,
  RowHeights,
} from "@/types";
import { nanoid } from "nanoid";

const DOCS_COLLECTION = "documents";
const CELLS_SUBCOLLECTION = "cells";

// ─── Document CRUD ────────────────────────────────────────────────────────────

export async function createDocument(
  ownerId: string,
  ownerName: string,
  title = "Untitled Spreadsheet",
  invitedUserIds: string[] = []
): Promise<SheetDocument> {
  const id = nanoid(12);
  const now = Date.now();
  const docData: SheetDocument = {
    id,
    title,
    ownerId,
    ownerName,
    createdAt: now,
    updatedAt: now,
    participants: [ownerId, ...invitedUserIds],
    invitedUsers: invitedUserIds,
    acceptedUsers: [ownerId],
    cells: {},
    colWidths: {},
    rowHeights: {},
    colOrder: Array.from({ length: 26 }, (_, i) => i),
  };

  await setDoc(doc(db, DOCS_COLLECTION, id), {
    id,
    title,
    ownerId,
    ownerName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    colWidths: {},
    rowHeights: {},
    colOrder: docData.colOrder,
    participants: docData.participants,
    invitedUsers: docData.invitedUsers,
    acceptedUsers: docData.acceptedUsers,
  });

  return docData;
}

export async function getDocumentMeta(
  docId: string
): Promise<DocumentMeta | null> {
  const snap = await getDoc(doc(db, DOCS_COLLECTION, docId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: data.id,
    title: data.title,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toMillis()
        : data.createdAt,
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toMillis()
        : data.updatedAt,
    participants: data.participants ?? [data.ownerId],
    invitedUsers: data.invitedUsers ?? [],
    acceptedUsers: data.acceptedUsers ?? [data.ownerId],
  };
}

// Prefix with _ to indicate intentionally unused parameter
export async function listDocuments(
  userId: string
): Promise<DocumentMeta[]> {
  const q = query(
    collection(db, DOCS_COLLECTION),
    where("participants", "array-contains", userId),
    limit(50)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id,
      title: data.title,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      createdAt:
        data.createdAt?.toMillis?.() ?? (data.createdAt as number) ?? Date.now(),
      updatedAt:
        data.updatedAt?.toMillis?.() ?? (data.updatedAt as number) ?? Date.now(),
      participants: data.participants ?? [data.ownerId],
      invitedUsers: data.invitedUsers ?? [],
      acceptedUsers: data.acceptedUsers ?? [data.ownerId],
    } satisfies DocumentMeta;
  });
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateDocumentTitle(
  docId: string,
  title: string
): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes all documents in a collection in batches.
 * Firestore Web SDK doesn't support recursive deletion natively.
 */
async function deleteCollection(colRef: any) {
  const snap = await getDocs(colRef);
  if (snap.empty) return;

  const batches: Promise<void>[] = [];
  let batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) batches.push(batch.commit());
  await Promise.all(batches);
}

export async function deleteDocument(docId: string): Promise<void> {
  const docRef = doc(db, DOCS_COLLECTION, docId);

  // 1. Delete cells
  await deleteCollection(collection(db, DOCS_COLLECTION, docId, CELLS_SUBCOLLECTION));

  // 2. Delete public messages
  await deleteCollection(collection(db, DOCS_COLLECTION, docId, "messages"));

  // 3. Delete private chats (and their messages)
  const pcSnap = await getDocs(collection(db, DOCS_COLLECTION, docId, "private_chats"));
  for (const pcDoc of pcSnap.docs) {
    await deleteCollection(collection(pcDoc.ref, "messages"));
    await deleteDoc(pcDoc.ref);
  }

  // 4. Delete DM signals (and their senders)
  const dsSnap = await getDocs(collection(db, DOCS_COLLECTION, docId, "dm_signals"));
  for (const dsDoc of dsSnap.docs) {
    await deleteCollection(collection(dsDoc.ref, "senders"));
    await deleteDoc(dsDoc.ref);
  }

  // 5. Delete presence data (RTDB)
  await remove(ref(rtdb, `presence/${docId}`));

  // 6. Finally delete the main document
  await deleteDoc(docRef);
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export async function acceptInvite(docId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    invitedUsers: arrayRemove(userId),
    acceptedUsers: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectInvite(docId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    participants: arrayRemove(userId),
    invitedUsers: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function inviteToDocument(docId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    participants: arrayUnion(...userIds),
    invitedUsers: arrayUnion(...userIds),
    updatedAt: serverTimestamp(),
  });
}

// ─── Cell operations ─────────────────────────────────────────────────────────

export async function loadCells(
  docId: string
): Promise<Record<CellId, CellData>> {
  const snap = await getDocs(
    collection(db, DOCS_COLLECTION, docId, CELLS_SUBCOLLECTION)
  );
  const cells: Record<CellId, CellData> = {};
  snap.docs.forEach((d) => {
    cells[d.id] = d.data() as CellData;
  });
  return cells;
}

export async function writeCell(
  docId: string,
  cellId: CellId,
  data: CellData
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(
    doc(db, DOCS_COLLECTION, docId, CELLS_SUBCOLLECTION, cellId),
    data
  );
  batch.update(doc(db, DOCS_COLLECTION, docId), {
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function writeCells(
  docId: string,
  updates: Record<CellId, CellData>
): Promise<void> {
  const batch = writeBatch(db);
  for (const [cellId, data] of Object.entries(updates)) {
    batch.set(
      doc(db, DOCS_COLLECTION, docId, CELLS_SUBCOLLECTION, cellId),
      data
    );
  }
  batch.update(doc(db, DOCS_COLLECTION, docId), {
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function updateColWidths(
  docId: string,
  colWidths: ColWidths
): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    colWidths,
    updatedAt: serverTimestamp(),
  });
}

export async function updateRowHeights(
  docId: string,
  rowHeights: RowHeights
): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    rowHeights,
    updatedAt: serverTimestamp(),
  });
}

export async function updateColOrder(
  docId: string,
  colOrder: number[]
): Promise<void> {
  await updateDoc(doc(db, DOCS_COLLECTION, docId), {
    colOrder,
    updatedAt: serverTimestamp(),
  });
}

// ─── Real-time listeners ─────────────────────────────────────────────────────

export function subscribeDocuments(
  userId: string,
  callback: (docs: DocumentMeta[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, DOCS_COLLECTION),
    where("participants", "array-contains", userId),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const docs: DocumentMeta[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        title: data.title,
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        createdAt:
          data.createdAt?.toMillis?.() ?? (data.createdAt as number) ?? Date.now(),
        updatedAt:
          data.updatedAt?.toMillis?.() ?? (data.updatedAt as number) ?? Date.now(),
        participants: data.participants ?? [data.ownerId],
        invitedUsers: data.invitedUsers ?? [],
        acceptedUsers: data.acceptedUsers ?? [data.ownerId],
      } satisfies DocumentMeta;
    });
    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(docs);
  }, onError);
}

export function subscribeDocument(
  docId: string,
  callback: (meta: Partial<SheetDocument>) => void,
  onDeleted?: () => void
): Unsubscribe {
  return onSnapshot(doc(db, DOCS_COLLECTION, docId), (snap) => {
    if (!snap.exists()) {
      onDeleted?.();
      return;
    }
    const data = snap.data();
    callback({
      id: data.id,
      title: data.title,
      colWidths: data.colWidths ?? {},
      rowHeights: data.rowHeights ?? {},
      colOrder: data.colOrder,
      updatedAt:
        data.updatedAt?.toMillis?.() ?? (data.updatedAt as number) ?? Date.now(),
    });
  });
}

export function subscribeCells(
  docId: string,
  callback: (cellId: CellId, data: CellData | null) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, DOCS_COLLECTION, docId, CELLS_SUBCOLLECTION),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "removed") {
          callback(change.doc.id, null);
        } else {
          callback(change.doc.id, change.doc.data() as CellData);
        }
      });
    }
  );
}

// ─── Chat Messaging (Ephemeral) ────────────────────────────────────────────────

export async function sendChatMessage(
  docId: string,
  uid: string,
  displayName: string,
  text: string,
  color: string,
  targetUid?: string
): Promise<void> {
  let messagesRef;
  if (targetUid) {
    const convId = [uid, targetUid].sort().join("_");
    messagesRef = collection(db, DOCS_COLLECTION, docId, "private_chats", convId, "messages");
    // Signal private unread for the recipient
    await setDmUnreadStatus(docId, uid, targetUid, true);
  } else {
    messagesRef = collection(db, DOCS_COLLECTION, docId, "messages");
  }

  await addDoc(messagesRef, {
    uid,
    displayName,
    text,
    color,
    timestamp: serverTimestamp(),
  });
}

export function subscribeChatMessages(
  docId: string,
  callback: (messages: any[]) => void,
  targetUid?: string,
  myUid?: string
): Unsubscribe {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  let messagesRef;
  if (targetUid && myUid) {
    const convId = [myUid, targetUid].sort().join("_");
    messagesRef = collection(db, DOCS_COLLECTION, docId, "private_chats", convId, "messages");
  } else {
    messagesRef = collection(db, DOCS_COLLECTION, docId, "messages");
  }

  const q = query(
    messagesRef,
    where("timestamp", ">=", Timestamp.fromMillis(oneHourAgo)),
    orderBy("timestamp", "asc")
  );

  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      timestamp: d.data().timestamp?.toMillis?.() ?? Date.now(),
    }));
    callback(msgs);
  });
}

/**
 * Signals that a user has unread messages from another user in a DM context.
 * Path: documents/{docId}/dm_signals/{recipient}/senders/{sender}
 */
export async function setDmUnreadStatus(
  docId: string,
  senderUid: string,
  recipientUid: string,
  hasUnread: boolean
): Promise<void> {
  const signalRef = doc(
    db, 
    DOCS_COLLECTION, docId, 
    "dm_signals", recipientUid, 
    "senders", senderUid
  );
  
  if (hasUnread) {
    await setDoc(signalRef, { hasUnread: true, timestamp: serverTimestamp() }, { merge: true });
  } else {
    // We could delete or just set false. Let's delete to keep subcollections clean?
    // Actually set false is easier to listen to without flickering.
    await setDoc(signalRef, { hasUnread: false, timestamp: serverTimestamp() }, { merge: true });
  }
}

export function subscribeDmSignals(
  docId: string,
  myUid: string,
  callback: (unreadUids: string[]) => void
): Unsubscribe {
  // Listen to all signals sent to me
  const signalsRef = collection(db, DOCS_COLLECTION, docId, "dm_signals", myUid, "senders");
  const q = query(signalsRef, where("hasUnread", "==", true));

  return onSnapshot(q, (snap) => {
    const uids = snap.docs.map(d => d.id);
    callback(uids);
  });
}

// ─── User profile (nickname) ──────────────────────────────────────────────────

const USERS_COLLECTION = "users";

export async function getUserNickname(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  return (snap.data().nickname as string) ?? null;
}

export async function getUserProfile(uid: string): Promise<{ displayName?: string; email?: string | null; nickname?: string; accountType?: import("@/types").AccountType } | null> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  return snap.data() as { displayName?: string; email?: string | null; nickname?: string; accountType?: import("@/types").AccountType };
}

export async function setUserProfile(
  uid: string,
  profile: {
    displayName?: string;
    email?: string | null;
    nickname?: string;
    accountType?: import("@/types").AccountType;
  }
): Promise<void> {
  const data: Record<string, any> = {};
  if (profile.displayName !== undefined) data.displayName = profile.displayName;
  if (profile.email !== undefined) data.email = profile.email;
  if (profile.nickname !== undefined) data.nickname = profile.nickname;
  if (profile.accountType !== undefined) data.accountType = profile.accountType;
  await setDoc(doc(db, USERS_COLLECTION, uid), data, { merge: true });
}

export async function isNicknameTaken(nickname: string, excludeUid?: string): Promise<boolean> {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where("nickname", "==", nickname), limit(1));
  const snap = await getDocs(q);
  
  if (snap.empty) return false;
  
  if (excludeUid) {
    const doc = snap.docs[0];
    return doc.id !== excludeUid;
  }
  
  return true;
}

export async function searchUsersByEmailOrNickname(
  queryText: string
): Promise<{ uid: string; displayName: string; email: string | null; nickname?: string }[]> {
  const text = queryText.toLowerCase().trim();
  if (!text) return [];

  const usersSnap = await getDocs(query(collection(db, USERS_COLLECTION), limit(200)));
  const matches: { uid: string; displayName: string; email: string | null; nickname?: string }[] = [];

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const email = (data.email || "").toLowerCase();
    const nickname = (data.nickname || "").toLowerCase();
    const displayName = (data.displayName || "").toLowerCase();

    if (email.includes(text) || nickname.includes(text) || displayName.includes(text)) {
      matches.push({
        uid: docSnap.id,
        displayName: data.displayName || "Unknown",
        email: data.email || null,
        nickname: data.nickname,
      });
    }
  }

  return matches;
}

export async function getAllRegisteredUsers(): Promise<{ uid: string; displayName: string; email: string | null; nickname?: string }[]> {
  const usersSnap = await getDocs(query(collection(db, USERS_COLLECTION), limit(200)));
  const users: { uid: string; displayName: string; email: string | null; nickname?: string }[] = [];
  
  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    if (data.displayName) {
      users.push({
        uid: docSnap.id,
        displayName: data.displayName,
        email: data.email || null,
        nickname: data.nickname,
      });
    }
  }
  return users;
}