"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, UserPlus, Users, BellRing,
    CheckCircle2, X, Search, Loader2, Trash2,
    MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { searchUsersByEmailOrNickname } from "@/lib/firebase/firestore";
import {
    subscribeFriends,
    subscribeFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    type FriendEntry,
    type FriendRequest,
} from "@/lib/firebase/friends";

interface UserResult {
    uid: string;
    displayName: string;
    email: string | null;
    nickname?: string;
}

export default function FriendsPage() {
    const { user } = useAuthStore();
    const router = useRouter();

    const [tab, setTab] = useState<"friends" | "requests">("friends");
    const [friends, setFriends] = useState<FriendEntry[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);

    // Add-friend modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [requesting, setRequesting] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    // ── Live Firestore data ────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const u1 = subscribeFriends(user.uid, setFriends);
        const u2 = subscribeFriendRequests(user.uid, setRequests);
        return () => { u1(); u2(); };
    }, [user]);

    // ── Search debounce ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!showAddModal) { setSearchResults([]); setSearchQuery(""); return; }
        if (searchQuery.length < 2) { setSearchResults([]); return; }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchUsersByEmailOrNickname(searchQuery);
                const friendUids = new Set(friends.map((f) => f.uid));
                const requestUids = new Set([
                    ...requests.map((r) => r.from),
                    ...requests.map((r) => r.to),
                ]);
                setSearchResults(
                    results.filter(
                        (r) => r.uid !== user?.uid &&
                            !friendUids.has(r.uid) &&
                            !requestUids.has(r.uid),
                    )
                );
            } catch { setSearchResults([]); }
            finally { setIsSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, showAddModal, friends, requests, user?.uid]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const handleSendRequest = useCallback(async (u: UserResult) => {
        if (!user) return;
        setRequesting(u.uid);
        try {
            await sendFriendRequest(
                user.uid, user.nickname ?? user.displayName, user.nickname, user.email,
                u.uid, u.nickname ?? u.displayName, u.nickname,
            );
            setShowAddModal(false);
            setSearchQuery("");
            setTab("requests");
        } finally { setRequesting(null); }
    }, [user]);

    const handleAccept = useCallback((req: FriendRequest) => acceptFriendRequest(req), []);
    const handleDecline = useCallback((id: string) => declineFriendRequest(id), []);

    const handleRemoveFriend = useCallback(async (friendUid: string) => {
        if (!user) return;
        setDeleting(friendUid);
        try { await removeFriend(user.uid, friendUid); }
        finally { setDeleting(null); }
    }, [user]);

    const incomingRequests = requests.filter((r) => r.to === user?.uid);
    const outgoingRequests = requests.filter((r) => r.from === user?.uid);

    if (!user) return <LoadingGrid fullPage size="lg" label="Loading friends..." />;

    return (
        <div className="min-h-screen bg-sheet-bg text-sheet-text">
            <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
                {/* Back arrow */}
                <button
                    onClick={() => router.back()}
                    className="group flex items-center gap-2 text-sheet-muted hover:text-sheet-accent transition-colors text-sm font-medium"
                >
                    <div className="w-8 h-8 rounded-lg border border-sheet-border bg-white flex items-center justify-center group-hover:border-sheet-accent/40 group-hover:bg-sheet-accent/5 transition-all">
                        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                    <span>Back to Hub</span>
                </button>

                {/* Title */}
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-sheet-accent" />
                    <span className="font-semibold text-sm text-sheet-text">Friends</span>
                </div>

                {/* Add Friend button */}
                <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sheet-accent text-white text-xs font-semibold hover:bg-sheet-accent-dim transition-colors shadow-sm"
                >
                    <UserPlus size={14} />
                    Add Friend
                </button>
            </header>

            {/* ── Page body ──────────────────────────────────────────────────────── */}
            <main className="relative z-10 max-w-3xl mx-auto px-6 pt-10 pb-16">

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-6 bg-white border border-sheet-border rounded-xl p-1 w-fit shadow-sm">
                    <button
                        onClick={() => setTab("friends")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "friends"
                                ? "bg-sheet-accent text-white shadow-sm"
                                : "text-sheet-muted hover:text-sheet-text"
                            }`}
                    >
                        <Users size={13} />
                        Friends
                    </button>

                    <button
                        onClick={() => setTab("requests")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "requests"
                                ? "bg-sheet-accent text-white shadow-sm"
                                : "text-sheet-muted hover:text-sheet-text"
                            }`}
                    >
                        <BellRing size={13} />
                        Requests
                        {incomingRequests.length > 0 && (
                            <span className={`text-[10px] px-1.5 py-px rounded-full ${tab === "requests" ? "bg-white/25 text-white" : "bg-red-100 text-red-500 font-bold"
                                }`}>
                                {incomingRequests.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* ── Friends list ──────────────────────────────────────────────────── */}
                {tab === "friends" && (
                    friends.length === 0 ? (
                        <EmptyState
                            icon={<Users size={28} className="text-sheet-muted" />}
                            title="No friends yet"
                            sub="Add someone to start chatting privately."
                            action={
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sheet-accent text-white text-xs font-semibold hover:bg-sheet-accent-dim transition-colors"
                                >
                                    <UserPlus size={13} /> Add your first friend
                                </button>
                            }
                        />
                    ) : (
                        <div className="grid gap-3">
                            {friends.map((f) => (
                                <div key={f.uid}
                                    className="flex items-center justify-between rounded-2xl border border-sheet-border bg-white px-5 py-4 hover:border-sheet-accent/25 hover:shadow-sm transition-all group">
                                    <div className="flex items-center gap-4">
                                        {/* Avatar */}
                                        <div className="w-11 h-11 rounded-full bg-sheet-accent/15 text-sheet-accent flex items-center justify-center text-base font-bold shrink-0">
                                            {f.name[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-sheet-text">{f.name}</p>
                                            {f.nickname && <p className="text-xs text-sheet-muted">@{f.nickname}</p>}
                                            {!f.nickname && f.email && <p className="text-xs text-sheet-muted">{f.email}</p>}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/chatbox?friendId=${encodeURIComponent(f.uid)}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sheet-border bg-sheet-bg text-xs font-semibold text-sheet-accent hover:bg-sheet-accent/5 hover:border-sheet-accent/30 transition-colors"
                                        >
                                            <MessageSquare size={13} />
                                            Chat
                                        </Link>
                                        <button
                                            onClick={() => handleRemoveFriend(f.uid)}
                                            disabled={deleting === f.uid}
                                            title="Remove friend"
                                            className="p-2 rounded-lg text-sheet-muted hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all disabled:opacity-40"
                                        >
                                            {deleting === f.uid
                                                ? <Loader2 size={15} className="animate-spin" />
                                                : <Trash2 size={15} />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* ── Requests tab ─────────────────────────────────────────────────── */}
                {tab === "requests" && (
                    requests.length === 0 ? (
                        <EmptyState
                            icon={<BellRing size={28} className="text-sheet-muted" />}
                            title="No pending requests"
                            sub="Friend requests you send or receive will appear here."
                        />
                    ) : (
                        <div className="space-y-6">
                            {/* Incoming */}
                            {incomingRequests.length > 0 && (
                                <div>
                                    <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-3">
                                        Incoming · {incomingRequests.length}
                                    </p>
                                    <div className="grid gap-3">
                                        {incomingRequests.map((req) => (
                                            <div key={req.id}
                                                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-base font-bold shrink-0">
                                                        {req.fromName[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-sheet-text">{req.fromName}</p>
                                                        {req.fromNickname && <p className="text-xs text-sheet-muted">@{req.fromNickname}</p>}
                                                        <p className="text-xs text-amber-600 font-medium mt-0.5">Wants to be your friend</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleAccept(req)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-sheet-accent px-4 py-2 text-xs font-semibold text-white hover:bg-sheet-accent-dim transition-colors shadow-sm"
                                                    >
                                                        <CheckCircle2 size={13} /> Accept
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecline(req.id)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-muted hover:bg-sheet-border transition-colors"
                                                    >
                                                        <X size={13} /> Decline
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Outgoing */}
                            {outgoingRequests.length > 0 && (
                                <div>
                                    <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-3">
                                        Sent · {outgoingRequests.length}
                                    </p>
                                    <div className="grid gap-3">
                                        {outgoingRequests.map((req) => (
                                            <div key={req.id}
                                                className="flex items-center justify-between rounded-2xl border border-sheet-border bg-white px-5 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-11 h-11 rounded-full bg-sheet-border text-sheet-muted flex items-center justify-center text-base font-bold shrink-0">
                                                        {req.toName[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-sheet-text">{req.toName}</p>
                                                        {req.toNickname && <p className="text-xs text-sheet-muted">@{req.toNickname}</p>}
                                                        <p className="text-xs text-sheet-muted mt-0.5">Awaiting their response…</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDecline(req.id)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-muted hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                                                >
                                                    <X size={13} /> Cancel
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                )}
            </main>

            {/* ── Add Friend modal ─────────────────────────────────────────────────── */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/25 backdrop-blur-sm"
                        onClick={() => setShowAddModal(false)}
                    />
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
                        style={{ animation: "modal-in 0.18s ease forwards" }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-sheet-accent/10 text-sheet-accent flex items-center justify-center">
                                    <UserPlus size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-sheet-text">Add a Friend</h3>
                                    <p className="text-xs text-sheet-muted">Search by email or nickname</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative mb-3">
                            <div className="absolute left-3 top-2.5 text-sheet-muted">
                                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                            </div>
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Enter email or @nickname…"
                                className="w-full rounded-xl border border-sheet-border bg-sheet-bg pl-9 pr-4 py-2.5 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors"
                            />
                        </div>

                        {/* Results */}
                        {searchResults.length > 0 && (
                            <div className="border border-sheet-border rounded-xl overflow-hidden mb-3 max-h-60 overflow-y-auto">
                                {searchResults.map((u) => (
                                    <button
                                        key={u.uid}
                                        onClick={() => handleSendRequest(u)}
                                        disabled={requesting === u.uid}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-sheet-bg transition-colors border-b border-sheet-border last:border-0 text-left disabled:opacity-60"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-sheet-accent/10 text-sheet-accent flex items-center justify-center text-xs font-bold shrink-0">
                                                {u.displayName[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-sheet-text">{u.displayName}</p>
                                                <p className="text-xs text-sheet-muted">{u.nickname ? `@${u.nickname}` : u.email}</p>
                                            </div>
                                        </div>
                                        {requesting === u.uid
                                            ? <Loader2 size={14} className="animate-spin text-sheet-muted" />
                                            : <span className="text-xs text-sheet-accent font-semibold">Send Request →</span>}
                                    </button>
                                ))}
                            </div>
                        )}

                        {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                            <div className="text-center py-4 text-xs text-sheet-muted">
                                No users found for &ldquo;{searchQuery}&rdquo;
                            </div>
                        )}

                        <p className="text-[11px] text-sheet-muted text-center mt-2">
                            A request will be sent — they can accept from their Hub.
                        </p>
                    </div>
                </div>
            )}

            <style jsx>{`
        .grid-mesh {
          background-image:
            linear-gradient(rgba(26,115,232,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26,115,232,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: grid-scroll 20s linear infinite;
        }
        @keyframes grid-scroll {
          from { background-position: 0 0; }
          to   { background-position: 60px 60px; }
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
        </div>
    );
}

function EmptyState({ icon, title, sub, action }: {
    icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-sheet-border/50 flex items-center justify-center mb-4">{icon}</div>
            <p className="text-base font-semibold text-sheet-text">{title}</p>
            <p className="text-sm text-sheet-muted mt-1.5 max-w-xs">{sub}</p>
            {action}
        </div>
    );
}