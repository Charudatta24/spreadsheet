"use client";

import {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type KeyboardEvent,
  type MouseEvent,
  type DragEvent,
} from "react";
import { useEditorStore, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from "@/lib/sync/store";
import { useSelectionStore } from "@/lib/sync/selectionStore";
import type { CellId, CellData, CellAddress, PresenceUser, CellFormat } from "@/types";
import { cellIdToAddress, addressToCellId } from "@/lib/formula";
import { dispatchCellWrite, dispatchColWidths, dispatchRowHeights, dispatchColOrder } from "@/hooks/useDocumentSync";

const NUM_ROWS = 50;
const ROW_HEADER_WIDTH = 48;

function colLabel(col: number): string {
  let label = "";
  let c = col + 1;
  while (c > 0) {
    const mod = (c - 1) % 26;
    label = String.fromCharCode(65 + mod) + label;
    c = Math.floor((c - 1) / 26);
  }
  return label;
}

// function ensureColor removed as we use ensureColorPersistent now

function formatNum(n: number, decimals = 6): string {
  if (!isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toLocaleString();
  return parseFloat(n.toFixed(decimals)).toLocaleString();
}

function extractNums(selectedCells: CellId[], cells: Record<string, { computed?: string; raw?: string }>): number[] {
  return selectedCells
    .map((id) => {
      const cell = cells[id];
      if (!cell) return NaN;
      const val = cell.computed ?? cell.raw ?? "";
      return parseFloat(String(val).replace(/,/g, ""));
    })
    .filter((n) => !isNaN(n) && isFinite(n));
}

function computeStats(nums: number[]) {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const count = nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = avg;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
  const stdev = nums.length >= 2 ? Math.sqrt(variance) : NaN;
  const product = nums.reduce((a, b) => a * b, 1);
  return { sum, avg, min, max, count, median, stdev, variance, product, firstNum: nums[0] };
}

type StatEntry = {
  label: string;
  value: string;
  op: string;
  tooltip: string;
};

function buildStatEntries(nums: number[]): Record<string, StatEntry[]> {
  const s = computeStats(nums);
  if (!s) return { Aggregates: [], Statistics: [], Math: [] };
  const isSingle = nums.length === 1;

  const aggregates: StatEntry[] = [
    ...(!isSingle ? [
      { label: "SUM",     value: `result= ${formatNum(s.sum)}`,    op: "SUM",     tooltip: "Sum of all selected cells" },
      { label: "AVG",     value: `result= ${formatNum(s.avg)}`,    op: "AVERAGE", tooltip: "Arithmetic mean" },
      { label: "MEDIAN",  value: `result= ${formatNum(s.median)}`, op: "MEDIAN",  tooltip: "Middle value when sorted" },
    ] : []),
    { label: "MIN",   value: `result= ${formatNum(s.min)}`,   op: "MIN",   tooltip: "Smallest value" },
    { label: "MAX",   value: `result= ${formatNum(s.max)}`,   op: "MAX",   tooltip: "Largest value" },
    { label: "COUNT", value: `result= ${String(s.count)}`,    op: "COUNT", tooltip: "Number of numeric cells" },
    ...(!isSingle ? [
      { label: "PRODUCT", value: `result= ${formatNum(s.product)}`, op: "PRODUCT", tooltip: "Product of all selected cells" },
    ] : []),
  ];

  const statistics: StatEntry[] = isSingle ? [
    { label: "SQRT",  value: s.firstNum >= 0 ? `result= ${formatNum(Math.sqrt(s.firstNum))}` : "#NUM!", op: "SQRT",  tooltip: "Square root" },
    { label: "ABS",   value: `result= ${formatNum(Math.abs(s.firstNum))}`,                              op: "ABS",   tooltip: "Absolute value" },
    { label: "SIGN",  value: `result= ${String(Math.sign(s.firstNum))}`,                                op: "SIGN",  tooltip: "Sign: −1, 0, or 1" },
  ] : [
    { label: "STDEV", value: isNaN(s.stdev)    ? "—" : `result= ${formatNum(s.stdev)}`,    op: "STDEV", tooltip: "Sample standard deviation" },
    { label: "VAR",   value: isNaN(s.variance) ? "—" : `result= ${formatNum(s.variance)}`, op: "VAR",   tooltip: "Sample variance" },
    { label: "SQRT",  value: `result= ${formatNum(Math.sqrt(Math.abs(s.sum)))}`,            op: "SQRT",  tooltip: "√ of the sum" },
  ];

  const math: StatEntry[] = isSingle ? [
    { label: "SQRT",   value: s.firstNum >= 0 ? `result= ${formatNum(Math.sqrt(s.firstNum))}` : "#NUM!", op: "SQRT",   tooltip: "Square root of this cell" },
    { label: "ABS",    value: `result= ${formatNum(Math.abs(s.firstNum))}`,                              op: "ABS",    tooltip: "Absolute value" },
    { label: "ROUND",  value: `result= ${String(Math.round(s.firstNum))}`,                               op: "ROUND",  tooltip: "Round to nearest integer" },
    { label: "INT",    value: `result= ${String(Math.floor(s.firstNum))}`,                               op: "INT",    tooltip: "Floor (round down)" },
    { label: "SIGN",   value: `result= ${String(Math.sign(s.firstNum))}`,                                op: "SIGN",   tooltip: "Sign: −1, 0, or 1" },
    { label: "LOG10",  value: s.firstNum > 0 ? `result= ${formatNum(Math.log10(s.firstNum))}` : "#NUM!", op: "LOG10",  tooltip: "Base-10 logarithm" },
    { label: "LN",     value: s.firstNum > 0 ? `result= ${formatNum(Math.log(s.firstNum))}` : "#NUM!",   op: "LN",     tooltip: "Natural logarithm" },
    { label: "EXP",    value: `result= ${formatNum(Math.exp(s.firstNum))}`,                              op: "EXP",    tooltip: "eˣ where x = this cell" },
  ] : [
    { label: "SQRT",      value: `result= √(${formatNum(s.sum)})`,                        op: "SQRT",      tooltip: "Insert SQRT per column below selection" },
    { label: "ABS",       value: `result= |${formatNum(s.min)}| … |${formatNum(s.max)}|`, op: "ABS",       tooltip: "Insert ABS per column below selection" },
    { label: "ROUND",     value: `result= ${String(Math.round(s.sum))} (sum,0)`,          op: "ROUND",     tooltip: "Insert ROUND per column below selection" },
    { label: "ROUNDUP",   value: `result= ↑ ${String(Math.ceil(s.avg))} (avg)`,           op: "ROUNDUP",   tooltip: "Insert ROUNDUP per column" },
    { label: "ROUNDDOWN", value: `result= ↓ ${String(Math.floor(s.avg))} (avg)`,          op: "ROUNDDOWN", tooltip: "Insert ROUNDDOWN per column" },
    { label: "INT",       value: `result= ${String(Math.floor(s.avg))} (avg)`,            op: "INT",       tooltip: "Insert INT per column" },
    { label: "PRODUCT",   value: `result= ${formatNum(s.product)}`,                       op: "PRODUCT",   tooltip: "Insert PRODUCT of each column" },
    { label: "LOG10",     value: s.sum > 0 ? `result= log(${formatNum(s.sum)})` : "#NUM!", op: "LOG10",    tooltip: "Insert LOG10 per column" },
  ];

  return { Aggregates: aggregates, Statistics: statistics, Math: math };
}

const CATEGORY_TITLES = ["Aggregates", "Statistics", "Math"] as const;

// ── Stats Popup ───────────────────────────────────────────────────────────────
interface StatsPopupProps {
  selectedCells: CellId[];
  cells: Record<string, { computed?: string; raw?: string }>;
  popupPos: { x: number; y: number } | null;
  onInsert: (op: string) => void;
  onClose: () => void;
}

function StatsPopup({ selectedCells, cells, popupPos, onInsert, onClose }: StatsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const nums = extractNums(selectedCells, cells);
  const [activeCategory, setActiveCategory] = useState<string>("Aggregates");

  // Close on any outside click — no stopPropagation so the overlay click always fires
  useEffect(() => {
    if (!popupPos) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use capture phase so it fires before cell mousedown handlers
    window.addEventListener("mousedown", handleOutside, true);
    return () => window.removeEventListener("mousedown", handleOutside, true);
  }, [popupPos, onClose]);

  if (nums.length === 0 || !popupPos) return null;

  const clampedX = Math.min(popupPos.x, window.innerWidth - 260);
  const clampedY = Math.min(popupPos.y, window.innerHeight - 420);

  const entriesByCategory = buildStatEntries(nums);
  const currentCategory = CATEGORY_TITLES.includes(activeCategory as typeof CATEGORY_TITLES[number])
    ? activeCategory
    : "Aggregates";
  const visibleEntries = entriesByCategory[currentCategory as keyof typeof entriesByCategory] ?? [];

  return (
    <div
      ref={popupRef}
      // Stop mousedown inside the popup from bubbling to the window handler
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: clampedX, top: clampedY, zIndex: 9999,
        background: "#ffffff", border: "1px solid #e2e4e9", borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
        width: 252, userSelect: "none", overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ background: "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)", padding: "10px 12px 8px", color: "#fff" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", opacity: 0.85 }}>SELECTION STATS</div>
        <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>{selectedCells.length} cells · {nums.length} numeric</div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #e2e4e9", background: "#f8f9fa" }}>
        {CATEGORY_TITLES.map((title) => (
          <button key={title} onClick={() => setActiveCategory(title)} style={{
            flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: 600, border: "none",
            borderBottom: title === currentCategory ? "2px solid #1a73e8" : "2px solid transparent",
            background: "transparent", color: title === currentCategory ? "#1a73e8" : "#6b7280",
            cursor: "pointer", letterSpacing: "0.03em", transition: "all 0.15s",
          }}>
            {title.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ padding: "6px 6px 4px" }}>
        {visibleEntries.length === 0 && (
          <div style={{ padding: "10px 8px", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
            Select multiple cells to see these stats
          </div>
        )}
        {visibleEntries.map(({ label, value, op, tooltip }) => (
          <div key={op} title={tooltip} onClick={() => onInsert(op)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            style={{ display: "flex", alignItems: "center", padding: "5px 8px", borderRadius: 7, cursor: "pointer", transition: "background 0.1s", gap: 8 }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: "#1a73e8", background: "#e8f0fe", borderRadius: 4, padding: "2px 5px", minWidth: 52, textAlign: "center", letterSpacing: "0.02em" }}>
              {label}
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: value.startsWith("#") ? "#dc2626" : value.startsWith("result=") ? "#059669" : "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </span>
            <span style={{ fontSize: 10, color: "#d1d5db" }} title="Insert formula below selection">↓</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#9ca3af", padding: "4px 14px 8px", borderTop: "1px solid #f3f4f6" }}>
        Click any row to insert formula below selection
      </div>
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────
function StatusBar({ selectedCells, cells }: { selectedCells: CellId[]; cells: Record<string, { computed?: string; raw?: string }> }) {
  const nums = extractNums(selectedCells, cells);
  if (nums.length === 0) return null;
  const s = computeStats(nums)!;
  const isSingle = nums.length === 1;
  return (
    <div style={{
      position: "sticky", bottom: 0, left: 0, right: 0, height: 28,
      background: "#f8f9fa", borderTop: "1px solid #e2e4e9",
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: 18, paddingRight: 16, paddingLeft: 12,
      fontSize: 12, color: "#444746", zIndex: 50, flexShrink: 0, overflowX: "auto",
    }}>
      {isSingle ? (
        <>
          <span><b>VAL:</b> {formatNum(s.firstNum)}</span>
          {s.firstNum >= 0 && <span><b>√:</b> {formatNum(Math.sqrt(s.firstNum))}</span>}
          <span><b>|x|:</b> {formatNum(Math.abs(s.firstNum))}</span>
          <span><b>ROUND:</b> {Math.round(s.firstNum)}</span>
        </>
      ) : (
        <>
          <span><b>SUM:</b> {formatNum(s.sum)}</span>
          <span><b>AVG:</b> {formatNum(s.avg)}</span>
          <span><b>MED:</b> {formatNum(s.median)}</span>
          <span><b>MIN:</b> {formatNum(s.min)}</span>
          <span><b>MAX:</b> {formatNum(s.max)}</span>
          {!isNaN(s.stdev) && <span><b>σ:</b> {formatNum(s.stdev)}</span>}
          <span><b>COUNT:</b> {s.count}</span>
        </>
      )}
    </div>
  );
}

// ── Cell Context Menu ─────────────────────────────────────────────────────────
interface CellContextMenuProps {
  contextMenu: { cellId: CellId; x: number; y: number } | null;
  cells: Record<string, { computed?: string; raw?: string }>;
  onInsert: (op: string) => void;
  onClose: () => void;
  onOpenStats: (cellId: CellId, x: number, y: number) => void;
  onEdit: (cellId: CellId) => void;
  onClear: (cellId: CellId) => void;
}

function CellContextMenu({ contextMenu, cells, onInsert, onClose, onOpenStats, onEdit, onClear }: CellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
    // Use capture phase — fires before any cell mousedown, no delay needed
    window.addEventListener("mousedown", handleOutside, true);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleOutside, true);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  const { cellId, x, y } = contextMenu;
  const cell = cells[cellId];
  const val = cell?.computed ?? cell?.raw ?? "";
  const num = parseFloat(String(val).replace(/,/g, ""));
  const hasNum = !isNaN(num) && isFinite(num);
  const menuW = 220;
  const menuH = 340;
  const cx = Math.min(x, window.innerWidth - menuW - 8);
  const cy = Math.min(y, window.innerHeight - menuH - 8);
  const addr = cellIdToAddress(cellId);
  const cellLabel = `${colLabel(addr.col)}${addr.row + 1}`;

  type MenuSection =
    | { type: "section"; label: string }
    | { type: "item"; label: string; hint?: string; icon: string; action: () => void; disabled?: boolean; danger?: boolean };

  const sections: MenuSection[] = [
    { type: "section", label: cellLabel },
    { type: "item", icon: "✏️", label: "Edit cell",   action: () => onEdit(cellId) },
    { type: "item", icon: "🗑️", label: "Clear cell",  action: () => onClear(cellId), danger: true },
    { type: "section", label: "Single-cell functions" },
    { type: "item", icon: "√",  label: "SQRT",  hint: hasNum ? (num >= 0 ? `result= ${parseFloat(Math.sqrt(num).toFixed(6))}` : "#NUM!") : "—", action: () => { onInsert("SQRT");  onClose(); }, disabled: !hasNum || num < 0 },
    { type: "item", icon: "|x|",label: "ABS",   hint: hasNum ? `result= ${Math.abs(num)}` : "—",  action: () => { onInsert("ABS");   onClose(); }, disabled: !hasNum },
    { type: "item", icon: "⌊⌉", label: "ROUND", hint: hasNum ? `result= ${Math.round(num)}` : "—", action: () => { onInsert("ROUND"); onClose(); }, disabled: !hasNum },
    { type: "item", icon: "⌊⌋", label: "INT",   hint: hasNum ? `result= ${Math.floor(num)}` : "—", action: () => { onInsert("INT");   onClose(); }, disabled: !hasNum },
    { type: "item", icon: "±",  label: "SIGN",  hint: hasNum ? `result= ${Math.sign(num)}` : "—",  action: () => { onInsert("SIGN");  onClose(); }, disabled: !hasNum },
    { type: "item", icon: "㏒", label: "LOG10", hint: hasNum && num > 0 ? `result= ${parseFloat(Math.log10(num).toFixed(6))}` : "#NUM!", action: () => { onInsert("LOG10"); onClose(); }, disabled: !hasNum || num <= 0 },
    { type: "item", icon: "㏑", label: "LN",    hint: hasNum && num > 0 ? `result= ${parseFloat(Math.log(num).toFixed(6))}` : "#NUM!",  action: () => { onInsert("LN");    onClose(); }, disabled: !hasNum || num <= 0 },
    { type: "item", icon: "eˣ", label: "EXP",   hint: hasNum ? `result= ${parseFloat(Math.exp(num).toFixed(4))}` : "—",                action: () => { onInsert("EXP");   onClose(); }, disabled: !hasNum },
    { type: "section", label: "View stats" },
    { type: "item", icon: "📊", label: "Open stats popup", action: () => onOpenStats(cellId, cx + menuW + 8, cy), disabled: !hasNum },
  ];

  return (
    <div
      ref={menuRef}
      // Prevent clicks inside the menu from reaching the capture-phase outside handler
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: cx, top: cy, zIndex: 99999,
        background: "#fff", border: "1px solid #e2e4e9", borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
        minWidth: menuW, overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none",
      }}>
      {sections.map((s, i) => {
        if (s.type === "section") {
          return (
            <div key={i} style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af",
              padding: i === 0 ? "8px 12px 4px" : "10px 12px 4px",
              borderTop: i > 0 ? "1px solid #f3f4f6" : "none", textTransform: "uppercase",
            }}>{s.label}</div>
          );
        }
        return (
          <div key={i}
            onClick={s.disabled ? undefined : s.action}
            onMouseEnter={(e) => { if (!s.disabled) e.currentTarget.style.background = s.danger ? "#fef2f2" : "#f0f4ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
              cursor: s.disabled ? "not-allowed" : "pointer",
              opacity: s.disabled ? 0.4 : 1, transition: "background 0.1s",
            }}
          >
            <span style={{ fontSize: 13, width: 20, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: s.danger ? "#dc2626" : "#1a1a1a", flex: 1 }}>{s.label}</span>
            {s.hint && (
              <span style={{
                fontSize: 11,
                color: s.hint.startsWith("#") ? "#dc2626" : "#059669",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
              }}>
                {s.hint}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ height: 6 }} />
    </div>
  );
}

// ── Main Grid ─────────────────────────────────────────────────────────────────
export function SpreadsheetGrid() {
  const {
    cells, activeCell, editingCell, editValue, selection,
    colWidths, rowHeights, colOrder, presenceUsers,
    lastUsedColor, lastUsedBgColor,
    setActiveCell, startEdit, commitEdit, cancelEdit, setEditValue,
    moveActive, extendSelection, setColWidth, setRowHeight, setColOrder,
  } = useEditorStore();

  function ensureColorPersistent(format: CellFormat | undefined) {
    const next = { ...format };
    if (!next.color) next.color = lastUsedColor;
    if (!next.bgColor && lastUsedBgColor) next.bgColor = lastUsedBgColor;
    return next;
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { multiSelected, setMultiSelected, setAllSelected } = useSelectionStore();
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ cellId: CellId; x: number; y: number } | null>(null);

  const isDragging = useRef(false);
  const dragStartCell = useRef<CellId | null>(null);

  const allSelectedCells = useMemo<CellId[]>(() => {
    const ids = new Set<CellId>(multiSelected);
    if (selection) {
      const { start, end } = selection;
      for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
        for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
          ids.add(addressToCellId(c, r));
        }
      }
    }
    if (activeCell) ids.add(activeCell);
    return Array.from(ids);
  }, [selection, multiSelected, activeCell]);

  useEffect(() => { setAllSelected(allSelectedCells); }, [allSelectedCells, setAllSelected]);

  const closePopup = useCallback(() => setPopupPos(null), []);

  const handleCellContextMenu = useCallback((e: MouseEvent, cellId: CellId) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCell(cellId);
    const { col, row } = cellIdToAddress(cellId);
    extendSelection({ col, row });
    setMultiSelected(new Set());
    setPopupPos(null);
    setContextMenu({ cellId, x: e.clientX, y: e.clientY });
  }, [setActiveCell, extendSelection, setMultiSelected]);

  const handleInsertFormula = useCallback((op: string) => {
    if (allSelectedCells.length === 0) return;
    const singleCellOps = new Set(["SQRT", "ABS", "LOG10", "LN", "EXP", "ROUND", "INT", "SIGN"]);

    if (singleCellOps.has(op) && allSelectedCells.length === 1) {
      const addr = cellIdToAddress(allSelectedCells[0]);
      const targetCellId = addressToCellId(addr.col, addr.row + 1);
      // Compute the actual numeric result to show "result= X" in the cell
      const srcCell = useEditorStore.getState().cells[allSelectedCells[0]];
      const srcVal = parseFloat(String(srcCell?.computed ?? srcCell?.raw ?? "0").replace(/,/g, ""));
      let computedResult = "result= ?";
      if (!isNaN(srcVal)) {
        let raw: number | string = srcVal;
        if (op === "SQRT") raw = srcVal >= 0 ? Math.sqrt(srcVal) : "#NUM!";
        else if (op === "ABS") raw = Math.abs(srcVal);
        else if (op === "ROUND") raw = Math.round(srcVal);
        else if (op === "INT") raw = Math.floor(srcVal);
        else if (op === "SIGN") raw = Math.sign(srcVal);
        else if (op === "LOG10") raw = srcVal > 0 ? Math.log10(srcVal) : "#NUM!";
        else if (op === "LN") raw = srcVal > 0 ? Math.log(srcVal) : "#NUM!";
        else if (op === "EXP") raw = Math.exp(srcVal);
        computedResult = typeof raw === "number"
          ? `result= ${parseFloat(raw.toFixed(6))}`
          : String(raw);
      }
      dispatchCellWrite(targetCellId, { raw: computedResult, computed: computedResult, format: { color: "#059669" } });
      useEditorStore.getState().startEdit(targetCellId, computedResult);
      useEditorStore.getState().commitEdit();
      setPopupPos(null);
      return;
    }

    let minCol = Infinity, maxCol = 0;
    allSelectedCells.forEach((id) => {
      const { col } = cellIdToAddress(id);
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    });

    for (let col = minCol; col <= maxCol; col++) {
      let colMinRow = Infinity, colMaxRow = 0;
      allSelectedCells.forEach((id) => {
        const a = cellIdToAddress(id);
        if (a.col === col) { if (a.row < colMinRow) colMinRow = a.row; if (a.row > colMaxRow) colMaxRow = a.row; }
      });
      if (colMinRow === Infinity) continue;
      const targetCellId = addressToCellId(col, colMaxRow + 1);
      const rangeStart = `${colLabel(col)}${colMinRow + 1}`;
      const rangeEnd = `${colLabel(col)}${colMaxRow + 1}`;
      const formula = `=${op}(${rangeStart}:${rangeEnd})`;
      // Gather nums in this column to compute result= display
      const colNums = allSelectedCells
        .filter((id) => cellIdToAddress(id).col === col)
        .map((id) => {
          const c = useEditorStore.getState().cells[id];
          return parseFloat(String(c?.computed ?? c?.raw ?? "").replace(/,/g, ""));
        })
        .filter((n) => !isNaN(n) && isFinite(n));
      let computedResult = formula;
      if (colNums.length > 0) {
        const sum = colNums.reduce((a, b) => a + b, 0);
        const avg = sum / colNums.length;
        let raw: number | string = sum;
        if (op === "SUM") raw = sum;
        else if (op === "AVERAGE") raw = avg;
        else if (op === "MEDIAN") { const s = [...colNums].sort((a,b)=>a-b); const m = Math.floor(s.length/2); raw = s.length%2!==0?s[m]:(s[m-1]+s[m])/2; }
        else if (op === "MIN") raw = Math.min(...colNums);
        else if (op === "MAX") raw = Math.max(...colNums);
        else if (op === "COUNT") raw = colNums.length;
        else if (op === "PRODUCT") raw = colNums.reduce((a,b)=>a*b,1);
        else if (op === "STDEV") { const mean=avg; const v=colNums.reduce((s,n)=>s+(n-mean)**2,0)/(colNums.length-1); raw=Math.sqrt(v); }
        else if (op === "SQRT") raw = sum >= 0 ? Math.sqrt(sum) : "#NUM!";
        else if (op === "ROUND") raw = Math.round(sum);
        else if (op === "ROUNDUP") raw = Math.ceil(avg);
        else if (op === "ROUNDDOWN") raw = Math.floor(avg);
        else if (op === "INT") raw = Math.floor(avg);
        else if (op === "LOG10") raw = sum > 0 ? Math.log10(sum) : "#NUM!";
        computedResult = typeof raw === "number"
          ? `result= ${parseFloat(raw.toFixed(6))}`
          : String(raw);
      }
      dispatchCellWrite(targetCellId, { raw: computedResult, computed: computedResult, format: { color: "#059669" } });
      useEditorStore.getState().startEdit(targetCellId, computedResult);
      useEditorStore.getState().commitEdit();
    }
    setPopupPos(null);
  }, [allSelectedCells]);

  // ── Column resize ──────────────────────────────────────────────────────────
  const resizingCol = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);
  function startColResize(e: MouseEvent, colIndex: number) {
    e.preventDefault(); e.stopPropagation();
    resizingCol.current = { colIndex, startX: e.clientX, startWidth: colWidths[colIndex] ?? DEFAULT_COL_WIDTH };
    function onMove(ev: globalThis.MouseEvent) {
      if (!resizingCol.current) return;
      setColWidth(resizingCol.current.colIndex, Math.max(30, resizingCol.current.startWidth + ev.clientX - resizingCol.current.startX));
    }
    function onUp() {
      if (resizingCol.current) { dispatchColWidths(useEditorStore.getState().colWidths); resizingCol.current = null; }
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  // ── Row resize ─────────────────────────────────────────────────────────────
  const resizingRow = useRef<{ rowIndex: number; startY: number; startHeight: number } | null>(null);
  function startRowResize(e: MouseEvent, rowIndex: number) {
    e.preventDefault(); e.stopPropagation();
    resizingRow.current = { rowIndex, startY: e.clientY, startHeight: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT };
    function onMove(ev: globalThis.MouseEvent) {
      if (!resizingRow.current) return;
      setRowHeight(resizingRow.current.rowIndex, Math.max(16, resizingRow.current.startHeight + ev.clientY - resizingRow.current.startY));
    }
    function onUp() {
      if (resizingRow.current) { dispatchRowHeights(useEditorStore.getState().rowHeights); resizingRow.current = null; }
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  // ── Column reorder ─────────────────────────────────────────────────────────
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  function handleColDragStart(e: DragEvent, colIndex: number) { setDragCol(colIndex); e.dataTransfer.effectAllowed = "move"; }
  function handleColDragOver(e: DragEvent, colIndex: number) { e.preventDefault(); setDragOverCol(colIndex); }
  function handleColDrop(e: DragEvent, targetIndex: number) {
    e.preventDefault();
    if (dragCol === null || dragCol === targetIndex) { setDragCol(null); setDragOverCol(null); return; }
    const newOrder = [...colOrder];
    const [removed] = newOrder.splice(dragCol, 1);
    newOrder.splice(targetIndex, 0, removed);
    setColOrder(newOrder); dispatchColOrder(newOrder);
    setDragCol(null); setDragOverCol(null);
  }

  // ── Cell mouse ─────────────────────────────────────────────────────────────
  function handleCellMouseDown(e: MouseEvent, cellId: CellId) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const next = new Set(multiSelected);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      setMultiSelected(next);
      setTimeout(() => setPopupPos({ x: e.clientX + 12, y: e.clientY - 20 }), 0);
      return;
    }
    isDragging.current = true;
    dragStartCell.current = cellId;
    setMultiSelected(new Set());
    setPopupPos(null);
    if (editingCell) {
      const result = commitEdit();
      if (result) dispatchCellWrite(result.cellId, { ...result.data, format: ensureColorPersistent(result.data.format) });
    }
    setActiveCell(cellId);
    const { col, row } = cellIdToAddress(cellId);
    extendSelection({ col, row });
  }

  function handleCellMouseEnter(e: MouseEvent, cellId: CellId) {
    if (!isDragging.current) return;
    void e;
    const { col, row } = cellIdToAddress(cellId);
    extendSelection({ col, row });
  }

  function handleCellMouseUp(e: MouseEvent) {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (selection) {
      const { start, end } = selection;
      if (Math.abs(end.col - start.col) + Math.abs(end.row - start.row) > 0) {
        setPopupPos({ x: e.clientX + 12, y: e.clientY - 20 });
      }
    }
  }

  useEffect(() => {
    function onUp() { isDragging.current = false; }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  function handleCellDoubleClick(cellId: CellId) {
    startEdit(cellId);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const active = useEditorStore.getState().activeCell;
    const editing = useEditorStore.getState().editingCell;
    if (editing) {
      if (e.key === "Escape") { cancelEdit(); containerRef.current?.focus(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const r = commitEdit();
        if (r) dispatchCellWrite(r.cellId, { ...r.data, format: ensureColorPersistent(r.data.format) });
        moveActive(1, 0); containerRef.current?.focus(); return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const r = commitEdit();
        if (r) dispatchCellWrite(r.cellId, { ...r.data, format: ensureColorPersistent(r.data.format) });
        moveActive(0, e.shiftKey ? -1 : 1); containerRef.current?.focus(); return;
      }
      return;
    }
    if (!active) return;
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (e.shiftKey) extendSelection({ col: cellIdToAddress(active).col, row: cellIdToAddress(active).row - 1 });
        else moveActive(-1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (e.shiftKey) extendSelection({ col: cellIdToAddress(active).col, row: cellIdToAddress(active).row + 1 });
        else moveActive(1, 0);
        break;
      case "ArrowLeft":  e.preventDefault(); moveActive(0, -1); break;
      case "ArrowRight": e.preventDefault(); moveActive(0, 1);  break;
      case "Tab":        e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1); break;
      case "Enter":      e.preventDefault(); startEdit(active); setTimeout(() => inputRef.current?.focus(), 0); break;
      case "Backspace":
      case "Delete": {
        const st = useEditorStore.getState();
        const existing = st.cells[active];
        st.startEdit(active, "");
        const r = st.commitEdit();
        if (r) dispatchCellWrite(r.cellId, { raw: "", computed: "", format: existing?.format });
        break;
      }
      case "Escape":
        cancelEdit(); setMultiSelected(new Set()); setPopupPos(null); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          startEdit(active, e.key);
          setTimeout(() => {
            const input = inputRef.current;
            if (input) {
              input.focus();
              // Place cursor at end — value already seeded by startEdit
              input.setSelectionRange(input.value.length, input.value.length);
            }
          }, 0);
        }
    }
  }

  useEffect(() => { if (!editingCell) containerRef.current?.focus(); }, [editingCell, activeCell]);

  const presenceMap = useMemo(() => {
    const map = new Map<CellId, typeof presenceUsers>();
    for (const u of presenceUsers) {
      if (u.focusedCell) { map.set(u.focusedCell, [...(map.get(u.focusedCell) ?? []), u]); }
    }
    return map;
  }, [presenceUsers]);

  const colTemplateWidths = useMemo(
    () => colOrder.map((ci) => `${colWidths[ci] ?? DEFAULT_COL_WIDTH}px`).join(" "),
    [colOrder, colWidths]
  );

  const rowTemplateRows = useMemo(
    () => `${DEFAULT_ROW_HEIGHT}px ${Array.from({ length: NUM_ROWS }, (_, r) => `${rowHeights[r] ?? DEFAULT_ROW_HEIGHT}px`).join(" ")}`,
    [rowHeights]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div ref={containerRef} className="w-full outline-none" tabIndex={0} onKeyDown={handleKeyDown} style={{ flex: 1, overflow: "auto" }}>
        <div className="grid-container" style={{
          gridTemplateColumns: `${ROW_HEADER_WIDTH}px ${colTemplateWidths}`,
          gridTemplateRows: rowTemplateRows,
          minWidth: "max-content",
        }}>
          <div className="grid-header-cell sticky top-0 left-0 z-30" style={{ gridColumn: 1, gridRow: 1 }} />

          {colOrder.map((colIndex, displayIdx) => (
            <div key={colIndex}
              className={`grid-header-cell sticky top-0 z-20 ${dragOverCol === displayIdx ? "dragging-over" : ""}`}
              style={{ gridColumn: displayIdx + 2, gridRow: 1 }}
              draggable
              onDragStart={(e) => handleColDragStart(e, displayIdx)}
              onDragOver={(e) => handleColDragOver(e, displayIdx)}
              onDrop={(e) => handleColDrop(e, displayIdx)}
              onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            >
              {colLabel(colIndex)}
              <div className="col-resize-handle" onMouseDown={(e) => startColResize(e, colIndex)} onClick={(e) => e.stopPropagation()} />
            </div>
          ))}

          {Array.from({ length: NUM_ROWS }, (_, rowIdx) => [
            <div key={`rh-${rowIdx}`} className="grid-header-cell sticky left-0 z-10" style={{ gridColumn: 1, gridRow: rowIdx + 2 }}>
              {rowIdx + 1}
              <div className="row-resize-handle" onMouseDown={(e) => startRowResize(e, rowIdx)} />
            </div>,

            ...colOrder.map((colIndex, displayIdx) => {
              const cellId = addressToCellId(colIndex, rowIdx);
              const cell = cells[cellId];
              const isActive = activeCell === cellId;
              const isEditing = editingCell === cellId;
              const isMultiSelected = multiSelected.has(cellId);
              const sel = selection;
              const inDragSelection = sel &&
                colIndex >= Math.min(sel.start.col, sel.end.col) &&
                colIndex <= Math.max(sel.start.col, sel.end.col) &&
                rowIdx >= Math.min(sel.start.row, sel.end.row) &&
                rowIdx <= Math.max(sel.start.row, sel.end.row);
              const inAnySelection = inDragSelection || isMultiSelected;
              const isSelected = inAnySelection && !isEditing;
              const fmt = cell?.format;

              return (
                <div key={cellId}
                  className={`grid-cell ${isActive ? "active" : ""} ${isEditing ? "editing" : ""} ${isSelected ? "selected" : ""}`}
                  style={{
                    gridColumn: displayIdx + 2, gridRow: rowIdx + 2,
                    fontWeight: fmt?.bold ? "bold" : undefined,
                    fontStyle: fmt?.italic ? "italic" : undefined,
                    textDecoration: fmt?.underline ? "underline" : undefined,
                    color: fmt?.color ?? lastUsedColor,
                    backgroundColor: fmt?.bgColor ?? lastUsedBgColor,
                    backgroundImage: isMultiSelected
                      ? "linear-gradient(rgba(26,115,232,0.18), rgba(26,115,232,0.18))"
                      : isActive && inDragSelection
                      ? "linear-gradient(rgba(26,115,232,0.22), rgba(26,115,232,0.22))"
                      : isSelected
                      ? "linear-gradient(rgba(26,115,232,0.10), rgba(26,115,232,0.10))"
                      : undefined,
                    textAlign: fmt?.align ?? "left",
                    fontSize: fmt?.fontSize ? `${fmt.fontSize}px` : undefined,
                    cursor: "cell",
                    outline: isMultiSelected
                      ? "2px solid #1a73e8"
                      : isActive
                      ? "2px solid #1a73e8"
                      : isSelected
                      ? "1px solid rgba(26,115,232,0.4)"
                      : undefined,
                    outlineOffset: isMultiSelected ? "-2px" : isActive ? "-2px" : isSelected ? "-1px" : undefined,
                  }}
                  onMouseDown={(e) => handleCellMouseDown(e, cellId)}
                  onMouseEnter={(e) => handleCellMouseEnter(e, cellId)}
                  onMouseUp={(e) => handleCellMouseUp(e)}
                  onDoubleClick={() => handleCellDoubleClick(cellId)}
                  onContextMenu={(e) => handleCellContextMenu(e, cellId)}
                >
                  {isEditing ? (
                    <input ref={inputRef} className="cell-input" value={editValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditValue(v);
                        if (activeCell) {
                          const existing = useEditorStore.getState().cells[activeCell];
                          dispatchCellWrite(activeCell, { raw: v, computed: v, format: ensureColorPersistent(existing?.format) });
                        }
                      }}
                      autoFocus spellCheck={false}
                      onBlur={() => {
                        const r = commitEdit();
                        if (r) dispatchCellWrite(r.cellId, { ...r.data, format: ensureColorPersistent(r.data.format) });
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Escape") { cancelEdit(); containerRef.current?.focus(); }
                        else if (e.key === "Enter") {
                          e.preventDefault();
                          const r = commitEdit();
                          if (r) dispatchCellWrite(r.cellId, { ...r.data, format: ensureColorPersistent(r.data.format) });
                          moveActive(1, 0); containerRef.current?.focus();
                        } else if (e.key === "Tab") {
                          e.preventDefault();
                          const r = commitEdit();
                          if (r) dispatchCellWrite(r.cellId, { ...r.data, format: ensureColorPersistent(r.data.format) });
                          moveActive(0, e.shiftKey ? -1 : 1); containerRef.current?.focus();
                        }
                      }}
                    />
                  ) : (cell?.computed ?? "")}

                  {presenceMap.get(cellId)?.map((u) => (
                    <div key={u.uid} className="presence-cursor" style={{ color: u.color, borderColor: u.color }}>
                      <span className="presence-label" style={{ background: u.color }}>{u.displayName}</span>
                    </div>
                  ))}
                </div>
              );
            }),
          ])}
        </div>
      </div>

      <StatusBar selectedCells={allSelectedCells} cells={cells as Record<string, { computed?: string; raw?: string }>} />

      <StatsPopup
        selectedCells={allSelectedCells}
        cells={cells as Record<string, { computed?: string; raw?: string }>}
        popupPos={popupPos}
        onInsert={handleInsertFormula}
        onClose={closePopup}
      />

      <CellContextMenu
        contextMenu={contextMenu}
        cells={cells as Record<string, { computed?: string; raw?: string }>}
        onInsert={handleInsertFormula}
        onClose={() => setContextMenu(null)}
        onOpenStats={(cellId, x, y) => { setMultiSelected(new Set([cellId])); setPopupPos({ x, y }); setContextMenu(null); }}
        onEdit={(cellId) => { startEdit(cellId); setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 0); }}
        onClear={(cellId) => {
          const st = useEditorStore.getState();
          const existing = st.cells[cellId];
          st.startEdit(cellId, "");
          const r = st.commitEdit();
          if (r) dispatchCellWrite(r.cellId, { raw: "", computed: "", format: existing?.format });
          setContextMenu(null);
        }}
      />
    </div>
  );
}