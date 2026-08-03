"use client";

import React, { useState, useRef, useEffect, useCallback, memo } from "react";

interface MeasurementCellProps {
  value: number | null | undefined;
  isCalculated?: boolean;
  calculatedValue?: number;
  isActive: boolean;
  onActivate: () => void;
  onChange: (val: number | null) => void;
  onKeyDownNav: (e: React.KeyboardEvent) => void;
  autoEdit?: boolean;
  onAutoEditDone?: () => void;
}

function MeasurementCellComponent({
  value,
  isCalculated = false,
  calculatedValue = 0,
  isActive,
  onActivate,
  onChange,
  onKeyDownNav,
  autoEdit = false,
  onAutoEditDone,
}: MeasurementCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const pendingInputValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (editing) {
      if (pendingInputValueRef.current !== null) {
        setInputValue(pendingInputValueRef.current);
        pendingInputValueRef.current = null;
      } else {
        setInputValue(value != null && !isNaN(value) ? String(value) : "");
      }
    }
  }, [editing, value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (isActive && !editing && cellRef.current) {
      cellRef.current.focus();
    }
  }, [isActive, editing]);

  // Activate editing on double click or pressing Enter/typing when active
  const startEditing = useCallback(
    (initialValue?: string) => {
      if (isCalculated) return;
      if (typeof initialValue === "string") {
        pendingInputValueRef.current = (
          pendingInputValueRef.current ?? ""
        ).concat(initialValue);
      }
      setEditing(true);
    },
    [isCalculated]
  );

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = inputValue.trim();
    if (trimmed === "") {
      onChange(null);
    } else {
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed) && parsed >= 0) {
        onChange(parsed);
      }
    }
  }, [inputValue, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editing) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        onKeyDownNav(e);
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    } else {
      if (isActive && !isCalculated) {
        if (e.key === "Enter") {
          e.preventDefault();
          startEditing();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onChange(null);
        } else if (/^[0-9.]$/.test(e.key)) {
          e.preventDefault();
          startEditing(e.key);
        } else {
          onKeyDownNav(e);
        }
      } else if (isActive && isCalculated) {
        onKeyDownNav(e);
      }
    }
  };

  const handleActivateClick = useCallback(() => {
    if (!isActive) {
      onActivate();
      return;
    }
    if (!editing && !isCalculated) {
      startEditing();
    }
  }, [isActive, onActivate, editing, isCalculated, startEditing]);

  const handleDoubleClick = useCallback(() => {
    startEditing();
  }, [startEditing]);

  useEffect(() => {
    if (autoEdit && isActive && !editing && !isCalculated) {
      startEditing();
      onAutoEditDone?.();
    }
  }, [autoEdit, isActive, editing, isCalculated, startEditing, onAutoEditDone]);

  const displayVal = isCalculated
    ? calculatedValue > 0
      ? calculatedValue.toFixed(2)
      : "0.00"
    : value != null && !isNaN(value)
    ? String(value)
    : "";

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onClick={handleActivateClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={`relative h-9 px-3 flex items-center justify-end text-xs font-mono border-r border-b border-sheet-border select-none transition-colors outline-none ${
        isCalculated
          ? "bg-slate-100/70 dark:bg-slate-800/40 text-emerald-600 font-bold cursor-not-allowed"
          : "bg-sheet-cell hover:bg-sheet-cell-hover cursor-text text-sheet-text"
      } ${
        isActive
          ? "ring-2 ring-emerald-500 z-10 bg-emerald-50/50"
          : ""
      }`}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => {
            // Only allow digits and a single decimal point
            const val = e.target.value;
            if (/^[0-9]*\.?[0-9]*$/.test(val)) {
              setInputValue(val);
            }
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape") {
              handleKeyDown(e);
            }
          }}
          className="absolute inset-0 w-full h-full px-3 text-right bg-white border-2 border-emerald-500 outline-none text-xs font-mono text-sheet-text z-20 shadow-lg"
        />
      ) : (
        <span className="truncate">{displayVal}</span>
      )}
    </div>
  );
}

export const MeasurementCell = memo(MeasurementCellComponent);
