import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  writeBatch,
  limit,
} from "firebase/firestore";
import { db } from "./client";
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
  title = "Untitled Spreadsheet"
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
  };
}

// Prefix with _ to indicate intentionally unused parameter
export async function listDocuments(
  _userId: string
): Promise<DocumentMeta[]> {
  const q = query(
    collection(db, DOCS_COLLECTION),
    orderBy("updatedAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id,
      title: data.title,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      createdAt:
        data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : (data.createdAt as number),
      updatedAt:
        data.updatedAt instanceof Timestamp
          ? data.updatedAt.toMillis()
          : (data.updatedAt as number),
    } satisfies DocumentMeta;
  });
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

export async function deleteDocument(docId: string): Promise<void> {
  await deleteDoc(doc(db, DOCS_COLLECTION, docId));
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

export function subscribeDocument(
  docId: string,
  callback: (meta: Partial<SheetDocument>) => void
): Unsubscribe {
  return onSnapshot(doc(db, DOCS_COLLECTION, docId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    callback({
      id: data.id,
      title: data.title,
      colWidths: data.colWidths ?? {},
      rowHeights: data.rowHeights ?? {},
      colOrder: data.colOrder,
      updatedAt:
        data.updatedAt instanceof Timestamp
          ? data.updatedAt.toMillis()
          : (data.updatedAt as number),
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