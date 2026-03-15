"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Plus, FileSpreadsheet, Trash2, LogOut, X, UserPlus, ArrowLeft } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { subscribeDocuments, createDocument, deleteDocument, searchUsersByEmailOrNickname, acceptInvite, rejectInvite } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";
import { EditableNickname } from "@/components/auth/EditableNickname";
import { ShareModal } from "@/components/grid/ShareModal";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { AppSwitcher } from "@/components/ui/AppSwitcher";
import { FluxWorkLogo } from "@/components/ui/FluxWorkLogo";
import type { DocumentMeta } from "@/types";

// ── Name prompt modal ─────────────────────────────────────────────────────────
function NewSheetModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string, invitedUserIds: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [isMultiple, setIsMultiple] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ uid: string; displayName: string; email: string | null; nickname?: string }[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<{ uid: string; displayName: string; email: string | null; nickname?: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        const results = await searchUsersByEmailOrNickname(searchQuery);
        // exclude yourself and already invited
        const filtered = results.filter(
          (r) => r.uid !== user?.uid && !invitedUsers.some((iu) => iu.uid === r.uid)
        );
        setSearchResults(filtered);
        setIsSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, invitedUsers, user?.uid]);

  const isValid = name.trim().length > 0 && (!isMultiple || invitedUsers.length > 0);

  function handleSubmit() {
    if (!isValid) return;
    onConfirm(name.trim(), invitedUsers.map((u) => u.uid));
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-sheet-surface border border-sheet-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        style={{ animation: "modal-in 0.15s ease" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-sheet-text">New spreadsheet</h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Input */}
        <label className="block text-xs text-sheet-muted mb-1.5">Spreadsheet name</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Spreadsheet name"
          maxLength={80}
          className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors mb-4"
        />

        {/* Sharing options */}
        <label className="block text-xs text-sheet-muted mb-1.5">Who can access?</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setIsMultiple(false)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              !isMultiple
                ? "bg-sheet-accent/10 border-sheet-accent text-sheet-accent"
                : "bg-sheet-bg border-sheet-border text-sheet-muted hover:border-sheet-accent/50"
            }`}
          >
            For you (Private)
          </button>
          <button
            onClick={() => setIsMultiple(true)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isMultiple
                ? "bg-sheet-accent/10 border-sheet-accent text-sheet-accent"
                : "bg-sheet-bg border-sheet-border text-sheet-muted hover:border-sheet-accent/50"
            }`}
          >
            Multiple (Shared)
          </button>
        </div>

        {isMultiple && (
          <div className="mb-4">
            <label className="block text-xs text-sheet-muted mb-1.5">Invite people by email or nickname</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5">
                  <LoadingGrid size="sm" />
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-sheet-surface border border-sheet-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
                      <span className="font-medium">{u.displayName}</span>
                      <span className="text-xs text-sheet-muted">
                        {u.nickname ? `@${u.nickname}` : u.email}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {invitedUsers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {invitedUsers.map((u) => (
                  <div key={u.uid} className="flex items-center gap-1 bg-sheet-bg border border-sheet-border rounded-full px-2 py-1 text-xs">
                    <span>{u.nickname ? `@${u.nickname}` : u.displayName}</span>
                    <button
                      onClick={() => setInvitedUsers(invitedUsers.filter((iu) => iu.uid !== u.uid))}
                      className="p-0.5 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-sheet-muted hover:bg-sheet-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 px-4 py-2 rounded-lg bg-sheet-accent hover:bg-sheet-accent-dim text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sharingDocId, setSharingDocId] = useState<string | null>(null);

  // Real-time listener — updates automatically when any sheet is created or deleted
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeDocuments(
      user.uid,
      (liveDocs) => {
        setDocs(liveDocs);
        setLoading(false);
      },
      (error) => {
        console.error("Dashboard sync error:", error);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  async function handleCreate(name: string, invitedUserIds: string[]) {
    if (!user) return;
    setShowModal(false);
    setCreating(true);
    try {
      const doc = await createDocument(user.uid, user.displayName, name, invitedUserIds);
      router.push(`/editor/${doc.id}`);
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this spreadsheet?")) return;
    await deleteDocument(id);
    // No need to update local state — subscribeDocuments will fire automatically
  }

  async function handleAccept(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    await acceptInvite(id, user.uid);
  }

  async function handleReject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    if (!confirm("Reject this invitation?")) return;
    await rejectInvite(id, user.uid);
  }

  async function handleSignOut() {
    await signOut(auth);
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text">
      {/* Name prompt modal */}
      {showModal && (
        <NewSheetModal
          onConfirm={handleCreate}
          onCancel={() => setShowModal(false)}
        />
      )}

      {sharingDocId && (
        <ShareModal 
          docId={sharingDocId} 
          onClose={() => setSharingDocId(null)} 
        />
      )}

      {/* Header */}
      <header className="border-b border-sheet-border bg-sheet-surface sticky top-0 z-30">
        <div className="w-full px-6 h-14 flex items-center justify-between relative">
          {/* Left side: Navigation */}
          <div className="flex items-center gap-2 z-10">
            <Link
              href="/hub"
              className="group p-1.5 rounded hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
              title="Back to App Selection"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            </Link>

            <AppSwitcher currentApp="spreadsheets" />
          </div>

          {/* Center: Logo & Brand (Absolutely centered) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 pointer-events-none md:pointer-events-auto">
            <FluxWorkLogo size={28} animated />
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sm tracking-tight text-sheet-text">FluxWork</span>
              {user && (
                <div className="flex items-center gap-1.5 h-4">
                   {!user.isAnonymous ? <EditableNickname /> : <span className="text-[10px] text-sheet-muted font-medium uppercase tracking-wider">{user.displayName}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Right side: User & Sign Out */}
          <div className="flex items-center gap-4 z-10">
            <div className="hidden sm:flex items-center gap-2 text-sm text-sheet-muted bg-sheet-bg/50 px-2 py-1 rounded-lg border border-sheet-border/50">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                style={{ background: user?.color }}
              >
                {(user?.nickname ?? user?.displayName)?.[0]?.toUpperCase()}
              </div>
              <span className="font-medium truncate max-w-[100px]">{user?.nickname ?? user?.displayName}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-sheet-muted hover:text-red-400 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/10 border border-transparent hover:border-red-400/20"
            >
              <LogOut size={14} />
              <span className="hidden xs:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Your spreadsheets</h1>
          <button
            onClick={() => setShowModal(true)}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-sheet-accent hover:bg-sheet-accent-dim text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            {creating ? "Creating…" : "New spreadsheet"}
          </button>
        </div>

        {loading ? (
          <LoadingGrid fullPage size="lg" label="Syncing your spreadsheets..." />
        ) : (
          <div className="reveal-content">
            {docs.length === 0 ? (
              <div className="text-center py-20">
                <FileSpreadsheet size={40} className="mx-auto mb-3 text-sheet-border" />
                <p className="text-sheet-muted text-sm">No spreadsheets yet.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-4 text-sheet-accent text-sm hover:underline"
                >
                  Create your first one →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {docs.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    userId={user?.uid ?? ""}
                    onDelete={(e) => handleDelete(doc.id, e)}
                    onAccept={(e) => handleAccept(doc.id, e)}
                    onReject={(e) => handleReject(doc.id, e)}
                    onShare={(e) => {
                      e.stopPropagation();
                      setSharingDocId(doc.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Doc card ──────────────────────────────────────────────────────────────────
function DocCard({
  doc,
  userId,
  onDelete,
  onAccept,
  onReject,
  onShare,
}: {
  doc: DocumentMeta;
  userId: string;
  onDelete: (e: React.MouseEvent) => void;
  onAccept: (e: React.MouseEvent) => void;
  onReject: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
}) {
  const isPendingInvite = doc.invitedUsers?.includes(userId);

  return (
    <div className="group relative bg-sheet-surface border border-sheet-border rounded-xl p-4 hover:border-sheet-accent transition-all hover:bg-sheet-surface/80 shadow-sm hover:shadow-md">
      {/* Background link for the whole card */}
      {!isPendingInvite && (
        <Link
          href={`/editor/${doc.id}`}
          className="absolute inset-0 z-0"
          aria-label={`Open ${doc.title}`}
        />
      )}

      <div className="relative z-10 pointer-events-none h-full flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="w-8 h-8 bg-sheet-accent/10 rounded-lg flex items-center justify-center">
            <FileSpreadsheet size={16} className="text-sheet-accent" />
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            {doc.ownerId === userId && (
              <>
                <button
                  onClick={onShare}
                  title="Share spreadsheet"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-sheet-muted hover:text-sheet-accent hover:bg-sheet-accent/10 transition-all"
                >
                  <UserPlus size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(e);
                  }}
                  title="Delete spreadsheet"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-sheet-muted hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        <h3 className="font-medium text-sm text-sheet-text truncate mb-1">
          {doc.title}
        </h3>
        <p className="text-xs text-sheet-muted mb-3">
          {doc.ownerName} · {doc.updatedAt ? formatDistanceToNow(doc.updatedAt, { addSuffix: true }) : "Just now"}
        </p>
        
        {isPendingInvite && (
          <div className="flex gap-2 mt-auto pt-3 border-t border-sheet-border/50 pointer-events-auto">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAccept(e);
              }}
              className="flex-1 px-2 py-1.5 bg-sheet-accent text-white text-xs font-medium rounded hover:bg-sheet-accent-dim transition-colors"
            >
              Accept
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReject(e);
              }}
              className="flex-1 px-2 py-1.5 bg-sheet-bg border border-sheet-border text-sheet-muted text-xs font-medium rounded hover:text-red-400 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}