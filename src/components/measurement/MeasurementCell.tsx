"use client";

import React, { useState, useRef, useEffect, useCallback, memo } from "react";

interface MeasurementCellProps {
  value: number | null | undefined;
  isCalculated?: boolean;
  calculatedValue?: number;
  isActive: boolean;
  disabled?: boolean;
  requireLongPressToEdit?: boolean;
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
  disabled = false,
  requireLongPressToEdit = false,
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
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      if (isCalculated || disabled) return;
      if (typeof initialValue === "string") {
        pendingInputValueRef.current = (
          pendingInputValueRef.current ?? ""
        ).concat(initialValue);
      }
      setEditing(true);
    },
    [isCalculated, disabled]
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
      if (isActive && !isCalculated && !disabled) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!requireLongPressToEdit) {
            startEditing();
          } else {
            onKeyDownNav(e);
          }
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (!requireLongPressToEdit) {
            onChange(null);
          }
        } else if (/^[0-9.]$/.test(e.key)) {
          e.preventDefault();
          if (!requireLongPressToEdit) {
            startEditing(e.key);
          }
        } else {
          onKeyDownNav(e);
        }
      } else if (isActive && (isCalculated || disabled)) {
        onKeyDownNav(e);
      }
    }
  };

  const handleActivateClick = useCallback(() => {
    if (!isActive) {
      onActivate();
      return;
    }
    if (!editing && !isCalculated && !disabled && !requireLongPressToEdit) {
      startEditing();
    }
  }, [isActive, onActivate, editing, isCalculated, disabled, requireLongPressToEdit, startEditing]);

  const handleDoubleClick = useCallback(() => {
    if (!disabled && !requireLongPressToEdit) startEditing();
  }, [disabled, requireLongPressToEdit, startEditing]);

  // Long press handling (for Customer S.No cells)
  const handleTouchStart = useCallback(() => {
    if (requireLongPressToEdit && !disabled && !isCalculated) {
      longPressTimerRef.current = setTimeout(() => {
        onActivate();
        startEditing();
      }, 500);
    }
  }, [requireLongPressToEdit, disabled, isCalculated, onActivate, startEditing]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoEdit && isActive && !editing && !isCalculated && !disabled) {
      startEditing();
      onAutoEditDone?.();
    }
  }, [autoEdit, isActive, editing, isCalculated, disabled, startEditing, onAutoEditDone]);

  const displayVal = isCalculated
    ? calculatedValue > 0
      ? String(calculatedValue)
      : "0"
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      className={`relative h-9 px-3 flex items-center justify-end text-xs font-mono border-r border-b border-sheet-border select-none transition-colors outline-none ${
        isCalculated
          ? "bg-slate-100/70 dark:bg-slate-800/40 text-emerald-600 font-bold cursor-not-allowed"
          : "bg-sheet-cell hover:bg-sheet-cell-hover cursor-text text-sheet-text"
      } ${
        isActive
          ? "ring-2 ring-emerald-500 z-10 bg-emerald-50/50"
          : ""
      }`}
      title={requireLongPressToEdit ? "Long press to edit S.No" : undefined}
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
