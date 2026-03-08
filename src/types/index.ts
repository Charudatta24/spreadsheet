// ─── Cell & Grid Types ───────────────────────────────────────────────────────

export type CellId = string; // e.g. "A1", "B3"
export type CellAddress = { col: number; row: number }; // 0-indexed

export type CellFormat = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;        // text color hex
  bgColor?: string;      // background color hex
  align?: "left" | "center" | "right";
  fontSize?: number;
};

export type CellData = {
  /** Raw input from user. May be a formula like =SUM(A1:B3) */
  raw: string;
  /** Computed display value after formula evaluation */
  computed: string;
  format?: CellFormat;
};

export type GridData = Record<CellId, CellData>;

// ─── Column / Row sizing ─────────────────────────────────────────────────────

export type ColWidths = Record<number, number>;   // col index → px
export type RowHeights = Record<number, number>;  // row index → px

// ─── Document ────────────────────────────────────────────────────────────────

export type SheetDocument = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  cells: GridData;
  colWidths: ColWidths;
  rowHeights: RowHeights;
  /** Ordered column indices (for reorder support) */
  colOrder?: number[];
  /** Ordered row indices */
  rowOrder?: number[];
};

export type DocumentMeta = Pick<
  SheetDocument,
  "id" | "title" | "ownerId" | "ownerName" | "createdAt" | "updatedAt"
>;

// ─── Presence / Users ────────────────────────────────────────────────────────

export type UserColor =
  | "#f87171"
  | "#fb923c"
  | "#fbbf24"
  | "#34d399"
  | "#38bdf8"
  | "#818cf8"
  | "#e879f9"
  | "#f472b6";

export const USER_COLORS: UserColor[] = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#38bdf8",
  "#818cf8",
  "#e879f9",
  "#f472b6",
];

export type PresenceUser = {
  uid: string;
  displayName: string;
  color: UserColor;
  /** Currently focused cell */
  focusedCell?: CellId;
  /** Timestamp of last heartbeat */
  lastSeen: number;
};

// ─── Real-time Operations (OT-lite) ─────────────────────────────────────────

/**
 * We use last-write-wins at cell granularity.
 * Each op carries a lamport-style sequence number per cell so stale
 * broadcasts can be discarded on arrival.
 */
export type CellOp = {
  type: "cell_update";
  docId: string;
  cellId: CellId;
  data: CellData;
  /** client-local sequence counter; server overwrites with Firestore timestamp */
  seq: number;
  authorId: string;
  authorName: string;
};

export type TitleOp = {
  type: "title_update";
  docId: string;
  title: string;
  authorId: string;
};

export type ColWidthOp = {
  type: "col_width";
  docId: string;
  colIndex: number;
  width: number;
  authorId: string;
};

export type RowHeightOp = {
  type: "row_height";
  docId: string;
  rowIndex: number;
  height: number;
  authorId: string;
};

export type ColReorderOp = {
  type: "col_reorder";
  docId: string;
  colOrder: number[];
  authorId: string;
};

export type Op = CellOp | TitleOp | ColWidthOp | RowHeightOp | ColReorderOp;

// ─── Save State ───────────────────────────────────────────────────────────────

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AppUser = {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  color: UserColor;
  /** true = signed in with Google, false = anonymous with chosen display name */
  isAnonymous: boolean;
};

// ─── Selection ───────────────────────────────────────────────────────────────

export type SelectionRange = {
  start: CellAddress;
  end: CellAddress;
};
