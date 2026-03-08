/**
 * src/lib/sync/selectionStore.ts
 *
 * A tiny standalone Zustand store that holds the multi-cell selection state.
 * Both SpreadsheetGrid (writer) and Toolbar (reader) import from here so
 * that formatting can be applied to every selected cell.
 */
import { create } from "zustand";
import type { CellId } from "@/types";

interface SelectionState {
  /** Cells highlighted via Ctrl+click */
  multiSelected: Set<CellId>;
  setMultiSelected: (cells: Set<CellId>) => void;

  /**
   * All currently selected cells — the union of:
   *   - activeCell
   *   - drag-range from useEditorStore.selection
   *   - multiSelected (Ctrl+click)
   * SpreadsheetGrid writes this; Toolbar reads it.
   */
  allSelected: CellId[];
  setAllSelected: (cells: CellId[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  multiSelected: new Set(),
  setMultiSelected: (multiSelected) => set({ multiSelected }),

  allSelected: [],
  setAllSelected: (allSelected) => set({ allSelected }),
}));