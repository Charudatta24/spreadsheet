"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useEditorStore } from "@/lib/sync/store";
import { useAuthStore } from "@/lib/sync/authStore";

export function PresenceBar({ 
  onToggleChat, 
  unreadCount,
  onSelectTarget,
  unreadDmUids = []
}: { 
  onToggleChat: () => void; 
  unreadCount: number;
  onSelectTarget: (uid: string | null) => void;
  unreadDmUids?: string[];
}) {
  const { presenceUsers } = useEditorStore();
  const { user } = useAuthStore();
  const [showList, setShowList] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Exclude self
  const others = presenceUsers.filter((u) => u.uid !== user?.uid);

  const openList = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowList((v) => !v);
  };

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
          <Avatar
            key={u.uid}
            name={u.displayName}
            color={u.color}
            title={u.nickname ? `${u.displayName} (@${u.nickname})` : u.displayName}
          />
        ))}
        {others.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-sheet-border border-2 border-sheet-bg flex items-center justify-center text-[9px] font-bold text-sheet-muted">
            +{others.length - 5}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-2">
        <button
          onClick={onToggleChat}
          className="relative p-1.5 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
          title="Open Group Chat"
        >
          <MessageSquare size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full px-1 flex items-center justify-center border-white border shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <button
          ref={triggerRef}
          onClick={() => openList()}
          className="relative text-xs text-sheet-muted hover:text-sheet-text transition-colors flex items-center gap-1.5"
        >
          {others.length > 0 ? `${others.length} online` : "Online"}
          {unreadDmUids.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse border border-white" />
              <span className="text-[10px] font-bold text-red-500">{unreadDmUids.length}</span>
            </div>
          )}
        </button>
      </div>

      {/* Dropdown list */}
      {showList && (
        <div
          className="absolute top-full right-0 mt-2 w-48 bg-sheet-surface border border-sheet-border rounded-xl shadow-xl z-50 py-2 animate-fade-in"
          onMouseLeave={() => setShowList(false)}
        >
          <div className="px-3 py-1 text-[10px] font-semibold uppercase text-sheet-muted tracking-wider">
            Active users
          </div>
          
          <button 
            className="w-full text-left"
            onClick={() => {
              onSelectTarget(null);
              setShowList(false);
            }}
          >
            <UserRow
              name="Group"
              nickname="Everyone"
              color="#6b7280"
              cell={null}
              hasUnread={unreadCount > 0}
            />
          </button>

          {others.map((u) => (
            <button 
              key={u.uid} 
              className="w-full text-left"
              onClick={() => {
                onSelectTarget(u.uid);
                setShowList(false);
              }}
            >
              <UserRow
                name={u.displayName}
                nickname={u.nickname}
                color={u.color}
                cell={u.focusedCell ?? null}
                hasUnread={unreadDmUids.includes(u.uid)}
              />
            </button>
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
  nickname,
  color,
  cell,
  suffix,
  hasUnread
}: {
  name: string;
  nickname?: string;
  color: string;
  cell: string | null;
  suffix?: string;
  hasUnread?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-sheet-bg/50 transition-colors">
      <div className="relative shrink-0">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
          style={{ background: color }}
        >
          {name?.[0]?.toUpperCase() ?? "?"}
        </div>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-sheet-text truncate flex items-center gap-1">
          {name} {nickname && <span className="text-sheet-muted ml-1">(@{nickname})</span>} {suffix && <span className="text-sheet-muted">{suffix}</span>}
          {hasUnread && <MessageSquare size={10} className="text-red-500 fill-red-500" />}
        </div>
        {cell && <div className="text-[10px] text-sheet-muted">{cell}</div>}
      </div>
    </div>
  );
}
