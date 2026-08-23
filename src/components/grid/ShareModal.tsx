"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, UserPlus, Loader2, Check } from "lucide-react";
import { searchUsersByEmailOrNickname, inviteToDocument } from "@/lib/firebase/firestore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { useAuthStore } from "@/lib/sync/authStore";

interface UserResult {
  uid: string;
  displayName: string;
  email: string | null;
  nickname?: string;
}

export function ShareModal({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await searchUsersByEmailOrNickname(searchQuery);
          // Exclude self and already in the invite list
          const filtered = results.filter(
            (r) => r.uid !== user?.uid && !invitedUsers.some((iu) => iu.uid === r.uid)
          );
          setSearchResults(filtered);
        } catch (e) {
          console.error("Search failed:", e);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, invitedUsers, user?.uid]);

  async function handleInvite() {
    if (invitedUsers.length === 0) return;
    setIsSubmitting(true);
    try {
      await inviteToDocument(docId, invitedUsers.map(u => u.uid));
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      console.error("Invite failed:", e);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-sheet-surface border border-sheet-border rounded-2xl shadow-2xl w-full max-w-[min(95vw,28rem)] max-h-[calc(100vh-4rem)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sheet-border">
          <h2 className="text-sm font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif] flex items-center gap-2">
            <UserPlus size={16} className="text-blue-600" />
            Share Spreadsheet
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {success ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-600">
                <Check size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-sheet-text">Invites sent!</p>
                <p className="text-xs text-sheet-muted">Your collaborators will be notified.</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-sheet-muted mb-1.5 uppercase tracking-wider">
                  Invite by email or nickname
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 text-sheet-muted">
                    <Search size={14} />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type name, email or @nickname..."
                    className="w-full bg-sheet-bg border border-sheet-border rounded-xl pl-9 pr-10 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-all shadow-sm"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-2.5">
                      <LoadingGrid size="sm" />
                    </div>
                  )}
                  
                  {/* Results Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-sheet-surface border border-sheet-border rounded-xl shadow-xl max-h-48 overflow-y-auto py-1">
                      {searchResults.map((u) => (
                        <button
                          key={u.uid}
                          onClick={() => {
                            setInvitedUsers([...invitedUsers, u]);
                            setSearchQuery("");
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-sheet-bg transition-colors flex flex-col"
                        >
                          <span className="font-medium text-sheet-text">{u.displayName}</span>
                          <span className="text-xs text-sheet-muted">
                            {u.nickname ? `@${u.nickname}` : u.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tag List */}
              {invitedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {invitedUsers.map((u) => (
                    <div 
                      key={u.uid} 
                      className="flex items-center gap-1.5 bg-sheet-accent/10 border border-sheet-accent/20 rounded-full px-2.5 py-1 text-xs text-sheet-accent shadow-sm"
                    >
                      <span className="font-medium">{u.nickname ? `@${u.nickname}` : u.displayName}</span>
                      <button
                        onClick={() => setInvitedUsers(invitedUsers.filter((iu) => iu.uid !== u.uid))}
                        className="p-0.5 hover:bg-sheet-accent/20 rounded-full transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="p-4 bg-sheet-bg border-t border-sheet-border flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-sheet-muted hover:bg-sheet-border transition-colors border border-transparent hover:border-sheet-border"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={invitedUsers.length === 0 || isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sheet-accent hover:bg-sheet-accent-dim text-white text-sm font-medium transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100"
            >
              {isSubmitting ? <LoadingGrid size="sm" /> : <UserPlus size={16} />}
              Send Invites
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
