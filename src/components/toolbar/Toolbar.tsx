"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { useEditorStore } from "@/lib/sync/store";
import { useSelectionStore } from "@/lib/sync/selectionStore";
import { dispatchCellWrite } from "@/hooks/useDocumentSync";
import type { CellFormat } from "@/types";

// ── Full colour palette organised by hue ─────────────────────────────────────
const PALETTE: { label: string; colors: string[] }[] = [
  {
    label: "Neutral",
    colors: [
      "#000000", "#1a1a1a", "#333333", "#4b5563", "#6b7280",
      "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6", "#ffffff",
    ],
  },
  {
    label: "Red",
    colors: [
      "#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444",
      "#f87171", "#fca5a5", "#fecaca", "#fee2e2", "#fff5f5",
    ],
  },
  {
    label: "Orange",
    colors: [
      "#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316",
      "#fb923c", "#fdba74", "#fed7aa", "#ffedd5", "#fff7ed",
    ],
  },
  {
    label: "Yellow",
    colors: [
      "#713f12", "#92400e", "#b45309", "#d97706", "#f59e0b",
      "#fbbf24", "#fcd34d", "#fde68a", "#fef9c3", "#fefce8",
    ],
  },
  {
    label: "Green",
    colors: [
      "#14532d", "#166534", "#15803d", "#16a34a", "#22c55e",
      "#4ade80", "#86efac", "#bbf7d0", "#dcfce7", "#f0fdf4",
    ],
  },
  {
    label: "Teal",
    colors: [
      "#134e4a", "#115e59", "#0f766e", "#0d9488", "#14b8a6",
      "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1", "#f0fdfa",
    ],
  },
  {
    label: "Blue",
    colors: [
      "#1e3a5f", "#1e40af", "#1d4ed8", "#2563eb", "#3b82f6",
      "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe", "#eff6ff",
    ],
  },
  {
    label: "Indigo",
    colors: [
      "#1e1b4b", "#312e81", "#3730a3", "#4338ca", "#4f46e5",
      "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#eef2ff",
    ],
  },
  {
    label: "Purple",
    colors: [
      "#3b0764", "#4a044e", "#6b21a8", "#7e22ce", "#9333ea",
      "#a855f7", "#c084fc", "#d8b4fe", "#ede9fe", "#faf5ff",
    ],
  },
  {
    label: "Pink",
    colors: [
      "#500724", "#831843", "#9d174d", "#be185d", "#db2777",
      "#ec4899", "#f472b6", "#f9a8d4", "#fce7f3", "#fdf2f8",
    ],
  },
  {
    label: "Brand",
    colors: [
      "#1a73e8", "#1557b0", "#0d47a1", "#00838f", "#00695c",
      "#2e7d32", "#558b2f", "#f57f17", "#e65100", "#4e342e",
    ],
  },
];

// ── Reusable colour picker dropdown ──────────────────────────────────────────
interface ColorPickerProps {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  label: React.ReactNode;
  title: string;
  allowTransparent?: boolean;
}

function ColorPicker({ value, onChange, label, title, allowTransparent }: ColorPickerProps) {
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState<"swatches" | "custom">("swatches");
  const [hex, setHex]     = useState(value ?? "#000000");
  const triggerRef        = useRef<HTMLButtonElement>(null);
  const panelRef          = useRef<HTMLDivElement>(null);

  // sync hex input when value changes externally
  useEffect(() => { if (value) setHex(value); }, [value]);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 50);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = useCallback((color: string | undefined) => {
    onChange(color);
    setOpen(false);
  }, [onChange]);

  // Panel position — open upward if near bottom of screen
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const panelH = 360;
    const top = spaceBelow > panelH ? rect.bottom + 4 : rect.top - panelH - 4;
    const left = Math.min(rect.left, window.innerWidth - 292);
    setPanelStyle({ position: "fixed", top, left, zIndex: 99999 });
  }, [open]);

  const activeColor = value && value !== "transparent" ? value : undefined;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        ref={triggerRef}
        title={title}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          padding: "3px 5px",
          border: "1px solid transparent",
          borderRadius: 6,
          background: open ? "#e8f0fe" : "transparent",
          cursor: "pointer",
          minWidth: 26,
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#f1f3f4"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, color: "#1a1a1a" }}>{label}</span>
        {/* colour preview bar */}
        <span style={{
          display: "block",
          width: 16,
          height: 3,
          borderRadius: 2,
          background: activeColor ?? (allowTransparent ? "repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)" : "#000"),
          border: "0.5px solid rgba(0,0,0,0.15)",
          marginTop: 1,
        }} />
      </button>

      {open && (
        <div
          ref={panelRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...panelStyle,
            background: "#fff",
            border: "1px solid #e2e4e9",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
            width: 288,
            fontFamily: "system-ui, -apple-system, sans-serif",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px 6px", borderBottom: "1px solid #f3f4f6",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* current colour preview */}
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                background: activeColor
                  ?? "repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)",
                border: "1px solid #e2e4e9", flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                {activeColor?.toUpperCase() ?? "NONE"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["swatches", "custom"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                  border: "none",
                  background: tab === t ? "#1a73e8" : "#f1f3f4",
                  color: tab === t ? "#fff" : "#6b7280",
                  cursor: "pointer", textTransform: "capitalize",
                }}>{t}</button>
              ))}
            </div>
          </div>

          {tab === "swatches" ? (
            <div style={{ padding: "8px 10px 10px", maxHeight: 300, overflowY: "auto" }}>
              {/* No-fill button */}
              {allowTransparent && (
                <button
                  onClick={() => pick(undefined)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", padding: "5px 6px", marginBottom: 8,
                    border: !activeColor ? "1.5px solid #1a73e8" : "1px solid #e2e4e9",
                    borderRadius: 6, background: !activeColor ? "#e8f0fe" : "#fff",
                    cursor: "pointer", fontSize: 11, color: "#444746",
                  }}
                >
                  <span style={{
                    display: "inline-block", width: 16, height: 16, borderRadius: 3,
                    background: "repeating-linear-gradient(45deg,#e5e7eb 0,#e5e7eb 2px,#fff 2px,#fff 5px)",
                    border: "1px solid #e2e4e9",
                  }} />
                  No fill / transparent
                </button>
              )}

              {PALETTE.map((group) => (
                <div key={group.label} style={{ marginBottom: 7 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: 3, textTransform: "uppercase" }}>
                    {group.label}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {group.colors.map((color) => {
                      const isActive = activeColor?.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={color}
                          title={color.toUpperCase()}
                          onClick={() => pick(color)}
                          style={{
                            width: 20, height: 20, borderRadius: 4, padding: 0,
                            background: color, cursor: "pointer",
                            border: isActive ? "2px solid #1a73e8" : "1px solid rgba(0,0,0,0.15)",
                            transform: isActive ? "scale(1.25)" : "scale(1)",
                            boxShadow: isActive ? "0 0 0 1px #fff, 0 0 0 3px #1a73e8" : "none",
                            transition: "transform 0.1s, box-shadow 0.1s",
                            flexShrink: 0,
                            outline: "none",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.3)";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
                            e.currentTarget.style.zIndex = "5";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = isActive ? "scale(1.25)" : "scale(1)";
                            e.currentTarget.style.boxShadow = isActive ? "0 0 0 1px #fff, 0 0 0 3px #1a73e8" : "none";
                            e.currentTarget.style.zIndex = "";
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Custom tab */
            <div style={{ padding: "14px 14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  style={{ width: 52, height: 52, border: "none", borderRadius: 8, cursor: "pointer", padding: 2, background: "transparent" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>HEX CODE</div>
                  <input
                    type="text"
                    value={hex}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHex(v);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") pick(hex); }}
                    placeholder="#000000"
                    style={{
                      width: "100%", fontSize: 13, fontFamily: "monospace",
                      padding: "5px 8px", border: "1px solid #e2e4e9",
                      borderRadius: 6, outline: "none", color: "#1a1a1a",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              {/* preview */}
              <div style={{
                height: 40, borderRadius: 8, background: hex,
                border: "1px solid #e2e4e9", marginBottom: 12,
              }} />
              <button
                onClick={() => pick(hex)}
                style={{
                  width: "100%", padding: "7px 0", borderRadius: 7,
                  background: "#1a73e8", color: "#fff", border: "none",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
export function Toolbar() {
  const { 
    activeCell, 
    cells, 
    applyFormat, 
    lastUsedColor, 
    setLastUsedColor, 
    lastUsedBgColor, 
    setLastUsedBgColor 
  } = useEditorStore();
  const { allSelected } = useSelectionStore();

  // Format preview reflects the active (focused) cell
  const activeFormat: Partial<CellFormat> = activeCell ? (cells[activeCell]?.format ?? {}) : {};

  // Apply format to EVERY selected cell (drag range + Ctrl+click + active)
  function applyAndWrite(format: Partial<CellFormat>) {
    // Determine which cells to format — use allSelected if it has multiple cells,
    // otherwise fall back to just activeCell
    const targets = allSelected.length > 0 ? allSelected : activeCell ? [activeCell] : [];
    if (targets.length === 0) return;

    targets.forEach((cellId) => {
      // Apply to Zustand store
      applyFormat(cellId, format);
      // Persist to Firestore via dispatch
      const state = useEditorStore.getState();
      const cell = state.cells[cellId];
      const isEditing = state.editingCell === cellId;
      
      // Ensure we don't send undefined to Firestore
      const finalFormat: CellFormat = { ...cell?.format, ...format };
      if (!finalFormat.color) finalFormat.color = state.lastUsedColor;
      if (!finalFormat.bgColor && state.lastUsedBgColor) finalFormat.bgColor = state.lastUsedBgColor;

      dispatchCellWrite(cellId, {
        raw:      isEditing ? state.editValue : (cell?.raw      ?? ""),
        computed: isEditing ? state.editValue : (cell?.computed ?? ""),
        format:   finalFormat,
      });
    });
  }

  return (
    <div
      className="shrink-0 flex items-center gap-1 px-3 border-b"
      style={{ height: 44, background: "#ffffff", borderColor: "#e2e4e9" }}
    >
      {/* Bold */}
      <button
        className="toolbar-btn font-bold"
        style={{
          background: activeFormat.bold ? "#1a73e8" : "transparent",
          color: activeFormat.bold ? "#fff" : "#444746",
          fontWeight: 700, fontSize: 13,
        }}
        onClick={() => applyAndWrite({ bold: !activeFormat.bold })}
        title="Bold (Ctrl+B)"
      >B</button>

      {/* Italic */}
      <button
        className="toolbar-btn"
        style={{
          background: activeFormat.italic ? "#1a73e8" : "transparent",
          color: activeFormat.italic ? "#fff" : "#444746",
          fontStyle: "italic", fontWeight: 600, fontSize: 13,
        }}
        onClick={() => applyAndWrite({ italic: !activeFormat.italic })}
        title="Italic (Ctrl+I)"
      >I</button>

      {/* Underline */}
      <button
        className="toolbar-btn"
        style={{
          background: activeFormat.underline ? "#1a73e8" : "transparent",
          color: activeFormat.underline ? "#fff" : "#444746",
          textDecoration: "underline", fontWeight: 600, fontSize: 13,
        }}
        onClick={() => applyAndWrite({ underline: !activeFormat.underline })}
        title="Underline (Ctrl+U)"
      >U</button>

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: "#e2e4e9", margin: "0 4px" }} />

      {/* Align Left */}
      <button
        className="toolbar-btn"
        style={{
          background: (activeFormat.align === "left" || !activeFormat.align) ? "#1a73e8" : "transparent",
          color: (activeFormat.align === "left" || !activeFormat.align) ? "#fff" : "#444746",
        }}
        onClick={() => applyAndWrite({ align: "left" })}
        title="Align Left"
      ><AlignLeft size={14} /></button>

      {/* Align Center */}
      <button
        className="toolbar-btn"
        style={{
          background: activeFormat.align === "center" ? "#1a73e8" : "transparent",
          color: activeFormat.align === "center" ? "#fff" : "#444746",
        }}
        onClick={() => applyAndWrite({ align: "center" })}
        title="Align Center"
      ><AlignCenter size={14} /></button>

      {/* Align Right */}
      <button
        className="toolbar-btn"
        style={{
          background: activeFormat.align === "right" ? "#1a73e8" : "transparent",
          color: activeFormat.align === "right" ? "#fff" : "#444746",
        }}
        onClick={() => applyAndWrite({ align: "right" })}
        title="Align Right"
      ><AlignRight size={14} /></button>

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: "#e2e4e9", margin: "0 4px" }} />

      {/* Font colour picker */}
      <ColorPicker
        value={activeFormat.color ?? lastUsedColor}
        onChange={(c) => {
          const color = c ?? "#1a1a1a";
          setLastUsedColor(color);
          applyAndWrite({ color });
        }}
        label="A"
        title="Font colour"
        allowTransparent={false}
      />

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: "#e2e4e9", margin: "0 4px" }} />

      {/* Background colour picker */}
      <ColorPicker
        value={activeFormat.bgColor ?? lastUsedBgColor}
        onChange={(c) => {
          setLastUsedBgColor(c);
          applyAndWrite({ bgColor: c });
        }}
        label={
          <span style={{
            display: "inline-block", width: 14, height: 14, borderRadius: 3,
            background: (activeFormat.bgColor ?? lastUsedBgColor) ?? "repeating-linear-gradient(45deg,#d1d5db 0,#d1d5db 2px,#fff 2px,#fff 5px)",
            border: "1px solid rgba(0,0,0,0.2)",
          }} />
        }
        title="Background colour"
        allowTransparent={true}
      />
    </div>
  );
}