"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/sync/store";
import { useAuthStore } from "@/lib/sync/authStore";

export function PresenceBar() {
  const { presenceUsers } = useEditorStore();
  const { user } = useAuthStore();
  const [showList, setShowList] = useState(false);

  // Exclude self
  const others = presenceUsers.filter((u) => u.uid !== user?.uid);

  return (
    <div className="relative flex items-center gap-1">
      {/* Stacked avatars */}
      <div className="flex -space-x-1.5">
        {/* Self */}
        {user && (
          <Avatar
            name={user.displayName}
            color={user.color}
            title="You"
            ring
          />
        )}
        {others.slice(0, 5).map((u) => (
          <Avatar key={u.uid} name={u.displayName} color={u.color} title={u.displayName} />
        ))}
        {others.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-sheet-border border-2 border-sheet-bg flex items-center justify-center text-[9px] font-bold text-sheet-muted">
            +{others.length - 5}
          </div>
        )}
      </div>

      {others.length > 0 && (
        <button
          onClick={() => setShowList(!showList)}
          className="text-xs text-sheet-muted hover:text-sheet-text ml-1 transition-colors"
        >
          {others.length} online
        </button>
      )}

      {/* Dropdown list */}
      {showList && (
        <div
          className="absolute top-full right-0 mt-2 w-48 bg-sheet-surface border border-sheet-border rounded-xl shadow-xl z-50 py-2 animate-fade-in"
          onMouseLeave={() => setShowList(false)}
        >
          <div className="px-3 py-1 text-[10px] font-semibold uppercase text-sheet-muted tracking-wider">
            Active users
          </div>
          {user && (
            <UserRow name={user.displayName} color={user.color} cell={null} suffix="(you)" />
          )}
          {others.map((u) => (
            <UserRow
              key={u.uid}
              name={u.displayName}
              color={u.color}
              cell={u.focusedCell ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({
  name,
  color,
  title,
  ring = false,
}: {
  name: string;
  color: string;
  title: string;
  ring?: boolean;
}) {
  return (
    <div
      title={title}
      className="w-6 h-6 rounded-full border-2 border-sheet-bg flex items-center justify-center text-[10px] font-bold text-white cursor-default"
      style={{ background: color, borderColor: ring ? color : undefined }}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function UserRow({
  name,
  color,
  cell,
  suffix,
}: {
  name: string;
  color: string;
  cell: string | null;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
        style={{ background: color }}
      >
        {name?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-sheet-text truncate">
          {name} {suffix && <span className="text-sheet-muted">{suffix}</span>}
        </div>
        {cell && <div className="text-[10px] text-sheet-muted">{cell}</div>}
      </div>
    </div>
  );
}
