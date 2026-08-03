import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  GridData,
  CellId,
  CellData,
  CellAddress,
  SelectionRange,
  SaveState,
  ColWidths,
  RowHeights,
  SheetDocument,
  PresenceUser,
  CellFormat,
} from "@/types";
import { recomputeGrid, addressToCellId, cellIdToAddress } from "@/lib/formula";

// ─── State shape ──────────────────────────────────────────────────────────────

interface EditorState {
  // Document
  docId: string | null;
  ownerId: string | null;
  title: string;
  cells: GridData;
  colWidths: ColWidths;
  rowHeights: RowHeights;
  colOrder: number[];  // logical → display order

  // UI
  activeCell: CellId | null;
  editingCell: CellId | null;
  editValue: string;
  selection: SelectionRange | null;

  // Save state
  saveState: SaveState;
  pendingWrites: CellId[];

  // Presence
  presenceUsers: PresenceUser[];

  // Grid dimensions
  numCols: number;
  numRows: number;

  // Formatting Persistence
  lastUsedColor: string;
  lastUsedBgColor: string | undefined;
}

interface EditorActions {
  // Document init
  loadDocument: (doc: Partial<SheetDocument>) => void;
  setTitle: (title: string) => void;
  setCells: (cells: GridData) => void;
  applyRemoteCell: (cellId: CellId, data: CellData | null) => void;
  applyRemoteMeta: (meta: Partial<SheetDocument>) => void;

  // Cell editing
  setActiveCell: (cellId: CellId | null) => void;
  startEdit: (cellId: CellId, initialValue?: string) => void;
  commitEdit: () => { cellId: CellId; data: CellData } | null;
  cancelEdit: () => void;
  setEditValue: (value: string) => void;

  // Cell format
  applyFormat: (cellId: CellId, format: Partial<CellFormat>) => void;

  // Selection
  setSelection: (sel: SelectionRange | null) => void;
  extendSelection: (to: CellAddress) => void;

  // Navigation
  moveActive: (dr: number, dc: number) => void;

  // Sizing
  setColWidth: (colIndex: number, width: number) => void;
  setRowHeight: (rowIndex: number, height: number) => void;
  setColOrder: (order: number[]) => void;

  // Save state
  setSaveState: (state: SaveState) => void;
  addPendingWrite: (cellId: CellId) => void;
  removePendingWrite: (cellId: CellId) => void;

  // Presence
  setPresenceUsers: (users: PresenceUser[]) => void;

  // Formatting Persistence
  setLastUsedColor: (color: string) => void;
  setLastUsedBgColor: (color: string | undefined) => void;
}

// ─── Default dimensions ───────────────────────────────────────────────────────

export const DEFAULT_COLS = 26;
export const DEFAULT_ROWS = 50;
export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 24;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    // Initial state
    docId: null,
    ownerId: null,
    title: "",
    cells: {},
    colWidths: {},
    rowHeights: {},
    colOrder: Array.from({ length: DEFAULT_COLS }, (_, i) => i),
    activeCell: null,
    editingCell: null,
    editValue: "",
    selection: null,
    saveState: "idle",
    pendingWrites: [] as CellId[],
    presenceUsers: [],
    numCols: DEFAULT_COLS,
    numRows: DEFAULT_ROWS,
    lastUsedColor: "#1a1a1a",
    lastUsedBgColor: undefined,

    // ── Document init ────────────────────────────────────────────────────────

    loadDocument: (doc) =>
      set((s) => {
        if (doc.id) s.docId = doc.id;
        if (doc.ownerId) s.ownerId = doc.ownerId;
        if (doc.title != null) s.title = doc.title;
        if (doc.colWidths) s.colWidths = doc.colWidths;
        if (doc.rowHeights) s.rowHeights = doc.rowHeights;
        if (doc.colOrder) s.colOrder = doc.colOrder;
      }),

    setTitle: (title) =>
      set((s) => {
        s.title = title;
      }),

    setCells: (cells) =>
      set((s) => {
        s.cells = recomputeGrid(cells);
      }),

    applyRemoteCell: (cellId, data) =>
      set((s) => {
        if (data === null) {
          delete s.cells[cellId];
        } else {
          s.cells[cellId] = data;
        }
        // Recompute formulas that may depend on this cell
        s.cells = recomputeGrid(s.cells);
      }),

    applyRemoteMeta: (meta) =>
      set((s) => {
        if (meta.ownerId) s.ownerId = meta.ownerId;
        if (meta.title != null) s.title = meta.title;
        if (meta.colWidths) s.colWidths = meta.colWidths;
        if (meta.rowHeights) s.rowHeights = meta.rowHeights;
        if (meta.colOrder) s.colOrder = meta.colOrder;
      }),

    // ── Cell editing ──────────────────────────────────────────────────────────

    setActiveCell: (cellId) =>
      set((s) => {
        s.activeCell = cellId;
        if (s.editingCell && s.editingCell !== cellId) {
          s.editingCell = null;
          s.editValue = "";
        }
        if (cellId) {
          const addr = cellIdToAddress(cellId);
          s.selection = { start: addr, end: addr };
        }
      }),

    startEdit: (cellId, initialValue) =>
      set((s) => {
        s.editingCell = cellId;
        s.activeCell = cellId;
        s.editValue =
          initialValue !== undefined
            ? initialValue
            : (s.cells[cellId]?.raw ?? "");
      }),

    commitEdit: () => {
      const { editingCell, editValue, cells } = get();
      if (!editingCell) return null;

      const existing = cells[editingCell];
      const { lastUsedColor, lastUsedBgColor } = get();
      
      const format = { ...existing?.format };
      if (!format.color) format.color = lastUsedColor;
      if (!format.bgColor && lastUsedBgColor) format.bgColor = lastUsedBgColor;

      const newData: CellData = {
        raw: editValue,
        computed: editValue, // will be recomputed below
        format,
      };

      set((s) => {
        s.cells[editingCell] = newData;
        s.cells = recomputeGrid(s.cells);
        s.editingCell = null;
        s.editValue = "";
      });

      // Return for side effects (Firestore write)
      return {
        cellId: editingCell,
        data: {
          ...newData,
          computed: get().cells[editingCell]?.computed ?? editValue,
        },
      };
    },

    cancelEdit: () =>
      set((s) => {
        s.editingCell = null;
        s.editValue = "";
      }),

    setEditValue: (value) =>
      set((s) => {
        s.editValue = value;
      }),

    // ── Cell format ───────────────────────────────────────────────────────────

    applyFormat: (cellId, format) =>
      set((s) => {
        const existing = s.cells[cellId] ?? { raw: "", computed: "" };
        s.cells[cellId] = {
          ...existing,
          format: { ...existing.format, ...format },
        };
      }),

    // ── Selection ─────────────────────────────────────────────────────────────

    setSelection: (sel) =>
      set((s) => {
        s.selection = sel;
      }),

    extendSelection: (to) =>
      set((s) => {
        if (!s.selection) {
          s.selection = { start: to, end: to };
        } else {
          s.selection = { ...s.selection, end: to };
        }
      }),

    // ── Navigation ────────────────────────────────────────────────────────────

    moveActive: (dr, dc) =>
      set((s) => {
        const current = s.activeCell
          ? cellIdToAddress(s.activeCell)
          : { col: 0, row: 0 };

        const newCol = Math.max(0, Math.min(s.numCols - 1, current.col + dc));
        const newRow = Math.max(0, Math.min(s.numRows - 1, current.row + dr));
        const newId = addressToCellId(newCol, newRow);

        s.activeCell = newId;
        s.editingCell = null;
        s.editValue = "";
        s.selection = { start: { col: newCol, row: newRow }, end: { col: newCol, row: newRow } };
      }),

    // ── Sizing ────────────────────────────────────────────────────────────────

    setColWidth: (colIndex, width) =>
      set((s) => {
        s.colWidths[colIndex] = width;
      }),

    setRowHeight: (rowIndex, height) =>
      set((s) => {
        s.rowHeights[rowIndex] = height;
      }),

    setColOrder: (order) =>
      set((s) => {
        s.colOrder = order;
      }),

    // ── Save state ────────────────────────────────────────────────────────────

    setSaveState: (state) =>
      set((s) => {
        s.saveState = state;
      }),

    addPendingWrite: (cellId) =>
      set((s) => {
        if (!s.pendingWrites.includes(cellId)) {
          s.pendingWrites.push(cellId);
        }
        s.saveState = "pending";
      }),

    removePendingWrite: (cellId) =>
      set((s) => {
        s.pendingWrites = s.pendingWrites.filter((id) => id !== cellId);
        if (s.pendingWrites.length === 0) s.saveState = "saved";
      }),

    // ── Presence ──────────────────────────────────────────────────────────────

    setPresenceUsers: (users) =>
      set((s) => {
        s.presenceUsers = users;
      }),

    setLastUsedColor: (color) =>
      set((s) => {
        s.lastUsedColor = color;
      }),

    setLastUsedBgColor: (color) =>
      set((s) => {
        s.lastUsedBgColor = color;
      }),
  }))
)
