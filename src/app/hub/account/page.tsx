"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Mail, AtSign, Calendar,
    Pencil, Check, X, Loader2, UserCircle,
} from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { setUserProfile, isNicknameTaken } from "@/lib/firebase/firestore";
import { subscribeFriends, FriendEntry } from "@/lib/firebase/friends";

export default function AccountPage() {
    const { user, setUser } = useAuthStore();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"about" | "friends">("about");
    const [friends, setFriends] = useState<FriendEntry[]>([]);

    // Nickname edit state
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const nickname = user?.nickname ?? "";

    useEffect(() => {
        if (!editing) setValue(nickname);
    }, [nickname, editing]);

    useEffect(() => {
        if (editing) setTimeout(() => inputRef.current?.focus(), 50);
    }, [editing]);

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeFriends(user.uid, setFriends);
        return unsub;
    }, [user]);

    async function handleSave() {
        const trimmed = value.trim();
        if (!trimmed || !user) { setEditing(false); return; }
        if (trimmed === nickname) { setEditing(false); return; }

        setSaving(true);
        setError("");
        try {
            const taken = await isNicknameTaken(trimmed, user.uid);
            if (taken) { setError("This nickname is already taken."); return; }

            await setUserProfile(user.uid, {
                displayName: user.displayName,
                email: user.email,
                nickname: trimmed,
            });
            setUser({ ...user, nickname: trimmed });
            setEditing(false);
        } catch {
            setError("Failed to update nickname.");
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() { setValue(nickname); setEditing(false); setError(""); }

    // Format created-at from auth metadata if available
    const joinedDate = user
        ? auth.currentUser?.metadata?.creationTime
            ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString()
            : "Unknown"
        : "—";

    if (!user) return <LoadingGrid fullPage size="lg" label="Loading account..." />;

    return (
        <div className="min-h-screen bg-sheet-bg text-sheet-text">
            <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
                {/* Back */}
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
                    <UserCircle size={16} className="text-sheet-accent" />
                    <span className="font-semibold text-sm text-sheet-text">Account</span>
                </div>
            </header>

            {/* ── Body ───────────────────────────────────────────────────────────── */}
            <main className="relative z-10 max-w-xl mx-auto px-6 pt-10 pb-16">

                {/* Avatar + name */}
                <div className="flex flex-col items-center mb-10">
                    <div className="w-20 h-20 rounded-full bg-sheet-accent flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4">
                        {user.displayName?.[0]?.toUpperCase()}
                    </div>
                    <h1 className="text-xl font-bold text-sheet-text">{user.displayName}</h1>
                    {user.nickname && (
                        <p className="text-sm text-sheet-muted mt-1">@{user.nickname}</p>
                    )}
                    <span className="mt-2 text-[11px] bg-sheet-accent/10 text-sheet-accent font-semibold px-3 py-1 rounded-full">
                        {user.isAnonymous ? "Guest" : "Google Account"}
                    </span>
                </div>

                <div className="mb-4 rounded-2xl border border-sheet-border bg-white/80 p-2 flex gap-2">
                    <button
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "about" ? "bg-sheet-accent text-white" : "text-sheet-text hover:bg-sheet-bg"}`}
                        onClick={() => setActiveTab("about")}
                    >About</button>
                    <button
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "friends" ? "bg-sheet-accent text-white" : "text-sheet-text hover:bg-sheet-bg"}`}
                        onClick={() => setActiveTab("friends")}
                    >Friends</button>
                </div>

                {activeTab === "about" ? (
                    <div className="space-y-3">
                        <InfoRow
                            icon={<Mail size={16} className="text-sheet-accent" />}
                            label="Owner email"
                            value={user.email ?? "—"}
                        />
                        <div className="bg-white rounded-2xl border border-sheet-border px-5 py-4 shadow-sm flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-sheet-accent/10 flex items-center justify-center shrink-0">
                                        <AtSign size={16} className="text-sheet-accent" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-0.5">Nickname</p>
                                        {!editing ? (
                                            <p className="text-sm font-semibold text-sheet-text">{nickname ? `@${nickname}` : "Not set"}</p>
                                        ) : (
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={value}
                                                onChange={(e) => setValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSave();
                                                    if (e.key === "Escape") handleCancel();
                                                }}
                                                placeholder="Enter a nickname"
                                                className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-sheet-accent transition-colors"
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!editing ? (
                                        <button
                                            onClick={() => setEditing(true)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                        >
                                            <Pencil size={14} />
                                            Edit
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleSave}
                                                disabled={saving}
                                                className="inline-flex items-center gap-2 rounded-lg bg-sheet-accent px-3 py-2 text-xs font-semibold text-white hover:bg-sheet-accent-dim transition-colors disabled:opacity-50"
                                            >
                                                <Check size={14} />
                                                Save
                                            </button>
                                            <button
                                                onClick={handleCancel}
                                                disabled={saving}
                                                className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {error ? (
                                <p className="text-xs text-red-500">{error}</p>
                            ) : (
                                <p className="text-xs text-sheet-muted">
                                    Nicknames are visible to collaborators in spreadsheets and chats. Max 32 characters.
                                </p>
                            )}
                        </div>
                        <InfoRow
                            icon={<Calendar size={16} className="text-sheet-accent" />}
                            label="Date created"
                            value={joinedDate}
                        />
                        <InfoRow
                            icon={<Calendar size={16} className="text-sheet-accent" />}
                            label="Account type"
                            value={user.isAnonymous ? "Guest (anonymous)" : "Google"}
                        />
                        <InfoRow
                            icon={<UserCircle size={16} className="text-sheet-accent" />}
                            label="User ID"
                            value={user.uid}
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <div className="text-xs uppercase tracking-widest font-bold text-sheet-muted">Friends</div>
                            <div className="text-sm font-semibold text-sheet-text">Accepted collaborators</div>
                        </div>

                        {friends.length === 0 ? (
                            <div className="rounded-2xl border border-sheet-border bg-white px-4 py-5 text-center text-sheet-muted">
                                No friends yet. Invite someone from the Hub.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {friends.map((f) => (
                                    <div key={f.uid} className="rounded-xl border border-sheet-border bg-white px-3 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="font-semibold text-sm text-sheet-text">{f.name}</div>
                                                <div className="text-xs text-sheet-muted">{f.email ?? "No email"}</div>
                                            </div>
                                            <div className="text-[11px] text-sheet-accent">{new Date(f.createdAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6">
                    <p className="text-xs text-sheet-muted text-center leading-relaxed">
                        Nicknames are visible to collaborators in spreadsheets and chats.<br />
                        Max 32 characters. Must be unique across all users.
                    </p>
                </div>
            </main>

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
      `}</style>
        </div>
    );
}

function InfoRow({
    icon, label, value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-sheet-border px-5 py-4 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sheet-accent/10 flex items-center justify-center shrink-0">
                {icon}
            </div>
            <div>
                <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-sheet-text">{value}</p>
            </div>
        </div>
    );
}