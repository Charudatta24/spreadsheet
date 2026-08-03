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
  /** Users who have any form of access or pending invite */
  participants: string[];
  /** Users who have been invited but haven't accepted */
  invitedUsers: string[];
  /** Users who have accepted the invite and can edit */
  acceptedUsers: string[];
};

export type DocumentMeta = Pick<
  SheetDocument,
  | "id"
  | "title"
  | "ownerId"
  | "ownerName"
  | "createdAt"
  | "updatedAt"
  | "participants"
  | "invitedUsers"
  | "acceptedUsers"
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
  nickname?: string;
  color: UserColor;
  /** Currently focused cell */
  focusedCell?: CellId;
  /** Timestamp of last heartbeat */
  lastSeen: number;
  /** ID of the user or 'group' being typed in */
  typingTarget?: string | null;
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

export type AccountType = "owner" | "non-owner";

export type AppUser = {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  color: UserColor;
  /** true = signed in with Google, false = anonymous with chosen display name */
  isAnonymous: boolean;
  /** Optional nickname set by user after Google sign-in, persisted in Firestore */
  nickname?: string;
  /** True if the user needs to provide their name for the first time */
  requiresName?: boolean;
  /** Account type: owner or non-owner */
  accountType?: AccountType;
};

// ─── Selection ───────────────────────────────────────────────────────────────

export type SelectionRange = {
  start: CellAddress;
  end: CellAddress;
};

// ─── Measurement Sheets ───────────────────────────────────────────────────────

export type PersonType = "worker" | "customer";
export type SheetCategory = "customer" | "polish" | "cutting";
export type LocationType = "local" | "national";
export type SheetType = "private" | "multiple";

export type WorkerPermissions = {
  canView: boolean;
  canModifyMeasurements: boolean;
  canModifySerialNumbers: boolean;
  canModifyRemarks: boolean;
  canAddRows: boolean;
  canDeleteRows: boolean;
};

export type MeasurementRow = {
  rowNumber: number;
  serialNumber: number;
  A: number | null; // Length
  B: number | null; // Height (Local) or Length in CM (National)
  C: number | null; // Calculated Value (Local) or Height (National)
  D?: number | null; // Height in CM (National)
  E?: number | null; // Calculated Value (National)
  remark?: string;
};

export type PersonMeasurement = {
  name: string;
  userId?: string;
  status?: "pending" | "accepted" | "declined";
  permissions?: WorkerPermissions;
  rows: MeasurementRow[];
};

export type SheetActivityLog = {
  action: string;
  userId: string;
  userName: string;
  timestamp: number;
};

export type CuttingRowItem = {
  rowId: string;
  sno: number;
  length: number | null;
  height: number | null;
  calculated: number;
  cutLength?: number | null;
  cutHeight?: number | null;
  waste?: number | null;
  polishName?: string;
  remark?: string;
};

export type CuttingMachineSection = {
  id: string;
  name: string; // e.g. "Machine 1"
  assignedRows: CuttingRowItem[];
};

export type CuttingData = {
  numMachines: number;
  numPolishes: number;
  polishes: { userId?: string; name: string }[];
  machines: CuttingMachineSection[];
  updatedAt?: string;
};

export type MeasurementSheet = {
  id: string;
  userId: string;
  title: string;
  date: string;
  dateISO?: string;
  dateTimestamp?: any;
  startingSerialNumber: number;
  personType: PersonType;
  sheetCategory?: SheetCategory;
  locationType: LocationType;
  sheetType: SheetType;
  numSlabs?: number;
  people: PersonMeasurement[];
  participantIds?: string[];
  total: number;
  favorite?: boolean;
  lastUpdatedBy?: string;
  lastUpdatedAt?: any;
  history?: SheetActivityLog[];
  createdAt: any;
  updatedAt: any;
  // Soft-delete / trash fields
  deleted?: boolean;
  deletedAt?: any;        // Firestore Timestamp — when soft-deleted
  permanentDeleteAt?: any; // Firestore Timestamp — deletedAt + 5 days
  // Cutting Sheet data
  cuttingData?: CuttingData;
};

