"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Check, ChevronDown, User as UserIcon } from "lucide-react";
import { getAllRegisteredUsers } from "@/lib/firebase/firestore";

interface RegisteredUser {
  uid: string;
  displayName: string;
  email: string | null;
  nickname?: string;
}

interface UserSelectDropdownProps {
  value: string; // The selected userId
  onChange: (userId: string, userName: string) => void;
  excludeUserIds?: string[]; // IDs to hide/disable
  placeholder?: string;
}

export function UserSelectDropdown({ value, onChange, excludeUserIds = [], placeholder = "Search for a person..." }: UserSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Fetch users when component mounts
    let mounted = true;
    getAllRegisteredUsers().then((fetchedUsers) => {
      if (mounted) {
        setUsers(fetchedUsers);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUser = users.find(u => u.uid === value);
  
  const filteredUsers = search.trim()
    ? users.filter(u => {
        if (excludeUserIds.includes(u.uid) && u.uid !== value) return false;
        const s = search.toLowerCase();
        return u.displayName.toLowerCase().startsWith(s) ||
          (u.nickname && u.nickname.toLowerCase().startsWith(s)) ||
          (u.email && u.email.toLowerCase().startsWith(s));
      })
    : [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 text-left flex items-center justify-between"
      >
        <span className={selectedUser ? "text-sheet-text" : "text-sheet-muted"}>
          {selectedUser ? selectedUser.displayName : placeholder}
        </span>
        <ChevronDown size={14} className="text-sheet-muted shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-sheet-border rounded-xl shadow-lg z-50 max-h-60 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-sheet-border shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sheet-muted" />
              <input
                type="text"
                placeholder="Search name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-sheet-bg border border-sheet-border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-emerald-500/40"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            {loading ? (
              <div className="p-3 text-xs text-center text-sheet-muted">Loading users...</div>
            ) : !search.trim() ? (
              <div className="p-3 text-xs text-center text-sheet-muted">Start typing to search by name, nickname, or email.</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-3 text-xs text-center text-sheet-muted">No matching users found.</div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => {
                    onChange(u.uid, u.displayName);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left flex items-center px-2 py-2 rounded-lg text-xs transition-colors ${
                    value === u.uid ? "bg-emerald-50 text-emerald-700 font-medium" : "hover:bg-sheet-bg text-sheet-text"
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mr-2 shrink-0">
                    <UserIcon size={10} />
                  </div>
                  <div className="flex-1 truncate">
                    <div>{u.displayName}</div>
                    {(u.nickname || u.email) && (
                      <div className="text-[9px] text-sheet-muted truncate">
                        {u.nickname ? `@${u.nickname}` : u.email}
                      </div>
                    )}
                  </div>
                  {value === u.uid && <Check size={14} className="text-emerald-500 shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
