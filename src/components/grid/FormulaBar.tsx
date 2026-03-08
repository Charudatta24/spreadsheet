"use client";

import { useEditorStore } from "@/lib/sync/store";

export function FormulaBar() {
  const { activeCell, cells, editingCell, editValue, setEditValue, startEdit } =
    useEditorStore();

  const displayCell = activeCell ?? "";
  const rawValue = editingCell
    ? editValue
    : (activeCell ? (cells[activeCell]?.raw ?? "") : "");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeCell) return;
    if (!editingCell) {
      startEdit(activeCell, e.target.value);
    } else {
      setEditValue(e.target.value);
    }
  }

  return (
    <div className="formula-bar shrink-0">
      <div className="text-xs font-mono text-sheet-muted w-12 shrink-0 text-center border-r border-sheet-border pr-2 mr-2">
        {displayCell}
      </div>
      <span className="text-sheet-muted text-xs mr-1 font-mono shrink-0">fx</span>
      <input
        value={rawValue}
        onChange={handleChange}
        placeholder={activeCell ? "" : "Select a cell"}
        className="flex-1 bg-transparent border-none outline-none text-sheet-text text-xs font-mono"
        spellCheck={false}
      />
    </div>
  );
}
