"use client";

import React, { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft, Mail, AtSign, Calendar, Building2, Phone,
    Pencil, Check, X, Loader2, UserCircle,
    Trash2, RotateCcw, AlertTriangle, Clock, Ruler, ShieldAlert,
    BookOpen, Calculator, FileText, Layers, ShieldCheck, Sparkles,
} from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { deleteUser } from "firebase/auth";
import { db } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { setUserProfile, isNicknameTaken } from "@/lib/firebase/firestore";
import { subscribeFriends, FriendEntry } from "@/lib/firebase/friends";
import {
    collection, query, where, onSnapshot,
    updateDoc, deleteDoc, doc, serverTimestamp,
    deleteField, getDocs, writeBatch,
} from "firebase/firestore";
import type { MeasurementSheet } from "@/types";

// ── Countdown helper ──────────────────────────────────────────────────────────
function getCountdown(permanentDeleteAt: any): string {
    if (!permanentDeleteAt) return "";
    const target: Date = permanentDeleteAt?.toDate ? permanentDeleteAt.toDate() : new Date(permanentDeleteAt);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return "Expiring soon";
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 2) return `${diffDays} days remaining`;
    if (diffDays === 1) {
        const hoursLeft = diffHours % 24;
        return `1 day ${hoursLeft}h remaining`;
    }
    if (diffHours >= 1) {
        const minsLeft = diffMins % 60;
        return `${diffHours}h ${minsLeft}m remaining`;
    }
    if (diffMins >= 1) return `${diffMins} minutes remaining`;
    return "Less than 1 minute remaining";
}

function isExpired(permanentDeleteAt: any): boolean {
    if (!permanentDeleteAt) return false;
    const target: Date = permanentDeleteAt?.toDate ? permanentDeleteAt.toDate() : new Date(permanentDeleteAt);
    return new Date() >= target;
}

function formatDeletedAt(deletedAt: any): string {
    if (!deletedAt) return "";
    const d: Date = deletedAt?.toDate ? deletedAt.toDate() : new Date(deletedAt);
    return d.toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ── Trash Tab Component ───────────────────────────────────────────────────────
function TrashTab({ uid, displayName }: { uid: string; displayName: string }) {
    const [trashedSheets, setTrashedSheets] = useState<MeasurementSheet[]>([]);
    const [loadingTrash, setLoadingTrash] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
    const [confirmPermDeleteId, setConfirmPermDeleteId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Subscribe to soft-deleted sheets owned by this user
    useEffect(() => {
        const q = query(
            collection(db, "measurementSheets"),
            where("userId", "==", uid),
            where("deleted", "==", true)
        );
        const unsub = onSnapshot(q, async (snap) => {
            const sheets: MeasurementSheet[] = [];
            const toPermDelete: string[] = [];

            snap.docs.forEach((d) => {
                const data = { id: d.id, ...d.data() } as MeasurementSheet;
                if (isExpired(data.permanentDeleteAt)) {
                    toPermDelete.push(d.id);
                } else {
                    sheets.push(data);
                }
            });

            // Auto-permanently delete expired sheets
            await Promise.all(
                toPermDelete.map((id) => deleteDoc(doc(db, "measurementSheets", id)).catch(() => { }))
            );

            setTrashedSheets(sheets);
            setLoadingTrash(false);
        });
        return unsub;
    }, [uid]);

    // Restore sheet
    const handleRestore = async (id: string) => {
        setActionLoading(true);
        try {
            const sheet = trashedSheets.find((s) => s.id === id);
            const historyEntry = {
                action: "Owner restored sheet",
                userId: uid,
                userName: displayName || "Owner",
                timestamp: Date.now(),
            };
            await updateDoc(doc(db, "measurementSheets", id), {
                deleted: deleteField(),
                deletedAt: deleteField(),
                permanentDeleteAt: deleteField(),
                updatedAt: serverTimestamp(),
                history: [
                    historyEntry,
                    ...(sheet?.history || []),
                ],
            });
            setConfirmRestoreId(null);
        } catch (err) {
            console.error("Error restoring sheet:", err);
        } finally {
            setActionLoading(false);
        }
    };

    // Permanent delete
    const handlePermanentDelete = async (id: string) => {
        setActionLoading(true);
        try {
            await deleteDoc(doc(db, "measurementSheets", id));
            setConfirmPermDeleteId(null);
        } catch (err) {
            console.error("Error permanently deleting sheet:", err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loadingTrash) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-sheet-accent" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Trash2 size={16} className="text-amber-500" />
                <h2 className="text-sm font-bold text-sheet-text">Deleted Measurement Sheets</h2>
                {trashedSheets.length > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {trashedSheets.length}
                    </span>
                )}
            </div>

            {trashedSheets.length === 0 ? (
                <div className="bg-white rounded-2xl border border-sheet-border p-8 text-center">
                    <Trash2 size={36} className="mx-auto mb-3 text-slate-200" />
                    <p className="text-sm font-semibold text-sheet-text mb-1">No deleted sheets</p>
                    <p className="text-xs text-slate-400">Measurement sheets you delete will appear here for 5 days before permanent deletion.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {trashedSheets.map((sheet) => {
                        const countdown = getCountdown(sheet.permanentDeleteAt);
                        const deletedStr = formatDeletedAt(sheet.deletedAt);
                        const totalRows = sheet.people.reduce((acc, p) => acc + (p.rows?.length || 0), 0);
                        const isUrgent = (() => {
                            if (!sheet.permanentDeleteAt) return false;
                            const target: Date = sheet.permanentDeleteAt?.toDate ? sheet.permanentDeleteAt.toDate() : new Date(sheet.permanentDeleteAt);
                            return (target.getTime() - Date.now()) < 24 * 60 * 60 * 1000;
                        })();

                        return (
                            <div
                                key={sheet.id}
                                className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 ${isUrgent ? "border-red-200 bg-red-50/30" : "border-sheet-border"}`}
                            >
                                {/* Sheet Info */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Ruler size={13} className="text-blue-600 shrink-0" />
                                            <p className="font-bold text-sm text-sheet-text truncate">{sheet.title}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={10} />
                                                Sheet date: <strong>{sheet.date}</strong>
                                            </span>
                                            <span>{sheet.locationType} · {sheet.personType}</span>
                                            <span>{totalRows} row{totalRows !== 1 ? "s" : ""}</span>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isUrgent ? "bg-red-100 text-red-600" : "bg-amber-50 text-amber-600 border border-amber-200"}`}>
                                        {sheet.people.length} {sheet.people.length === 1 ? "person" : "people"}
                                    </span>
                                </div>

                                {/* Deleted timestamp + countdown */}
                                <div className={`rounded-xl px-3 py-2 flex items-center gap-2 text-xs ${isUrgent ? "bg-red-100/60 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                                    <Clock size={13} className="shrink-0" />
                                    <div>
                                        <span className="font-semibold">Deleted:</span> {deletedStr}
                                        <span className="mx-2">·</span>
                                        <span className={`font-bold ${isUrgent ? "text-red-600" : "text-amber-600"}`}>{countdown}</span>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        onClick={() => setConfirmRestoreId(sheet.id)}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
                                    >
                                        <RotateCcw size={13} />
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => setConfirmPermDeleteId(sheet.id)}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold transition-all"
                                    >
                                        <Trash2 size={13} />
                                        Delete Permanently
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Restore Confirm Modal */}
            {confirmRestoreId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <RotateCcw size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-sheet-text mb-1">Restore this measurement sheet?</h3>
                                <p className="text-xs text-slate-500">
                                    The sheet and its previous permissions, measurements, serial numbers, and remarks will be restored to its original location.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setConfirmRestoreId(null)}
                                disabled={actionLoading}
                                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleRestore(confirmRestoreId)}
                                disabled={actionLoading}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                Restore
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Permanent Delete Confirm Modal */}
            {confirmPermDeleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-sheet-text mb-1">Permanently delete this sheet?</h3>
                                <p className="text-xs text-slate-500">
                                    This action is <strong>irreversible</strong>. All measurement data, serial numbers, remarks, and worker information will be permanently removed.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setConfirmPermDeleteId(null)}
                                disabled={actionLoading}
                                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handlePermanentDelete(confirmPermDeleteId)}
                                disabled={actionLoading}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Account Page ─────────────────────────────────────────────────────────
function AccountPageContent() {
    const { user, setUser } = useAuthStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabParam = searchParams.get("tab");
    const [activeTab, setActiveTab] = useState<"about" | "formulas" | "friends" | "trash">(
        tabParam === "trash" ? "trash" : tabParam === "formulas" ? "formulas" : "about"
    );
    const [friends, setFriends] = useState<FriendEntry[]>([]);

    // Nickname edit state
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Delete account state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

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

    const [editingFactory, setEditingFactory] = useState(false);
    const [factoryValue, setFactoryValue] = useState(user?.factoryName || "");
    const [savingFactory, setSavingFactory] = useState(false);
    const [factoryError, setFactoryError] = useState("");

    useEffect(() => {
        if (user?.factoryName) {
            setFactoryValue(user.factoryName);
        }
    }, [user?.factoryName]);

    async function handleSaveFactory() {
        const trimmed = factoryValue.trim();
        if (!trimmed || !user) { setEditingFactory(false); return; }

        setSavingFactory(true);
        setFactoryError("");
        try {
            await setUserProfile(user.uid, {
                factoryName: trimmed,
            });
            setUser({ ...user, factoryName: trimmed });
            setEditingFactory(false);
        } catch {
            setFactoryError("Failed to update Factory Name.");
        } finally {
            setSavingFactory(false);
        }
    }

    function handleCancelFactory() {
        setFactoryValue(user?.factoryName || "");
        setEditingFactory(false);
        setFactoryError("");
    }

    const [editingPhone, setEditingPhone] = useState(false);
    const [phoneValue, setPhoneValue] = useState(user?.phoneNumber || "");
    const [savingPhone, setSavingPhone] = useState(false);
    const [phoneError, setPhoneError] = useState("");

    useEffect(() => {
        if (user?.phoneNumber) {
            setPhoneValue(user.phoneNumber);
        }
    }, [user?.phoneNumber]);

    async function handleSavePhone() {
        const trimmed = phoneValue.trim();
        if (!trimmed || !user) {
            setEditingPhone(false);
            return;
        }

        const digitsOnly = trimmed.replace(/\D/g, "");
        if (digitsOnly.length < 10 || digitsOnly.length > 15) {
            setPhoneError("Please enter a valid phone number (at least 10 digits).");
            return;
        }

        setSavingPhone(true);
        setPhoneError("");
        try {
            await setUserProfile(user.uid, {
                phoneNumber: trimmed,
            });
            setUser({ ...user, phoneNumber: trimmed });
            setEditingPhone(false);
        } catch {
            setPhoneError("Failed to update Phone Number.");
        } finally {
            setSavingPhone(false);
        }
    }

    function handleCancelPhone() {
        setPhoneValue(user?.phoneNumber || "");
        setEditingPhone(false);
        setPhoneError("");
    }

    // Delete account: cascade-delete all owned data then delete Auth account
    async function handleDeleteAccount() {
        if (!user || !auth.currentUser) return;
        setIsDeleting(true);
        setDeleteError("");
        try {
            const uid = user.uid;
            const batch = writeBatch(db);

            // 1. Delete owned measurement sheets
            const sheetsSnap = await getDocs(
                query(collection(db, "measurementSheets"), where("userId", "==", uid))
            );
            sheetsSnap.forEach((d) => batch.delete(d.ref));

            // 2. Delete owned documents (spreadsheets)
            const docsSnap = await getDocs(
                query(collection(db, "documents"), where("owner", "==", uid))
            );
            docsSnap.forEach((d) => batch.delete(d.ref));

            // 3. Delete friend requests sent by or addressed to this user
            const frFromSnap = await getDocs(
                query(collection(db, "friendRequests"), where("fromUid", "==", uid))
            );
            frFromSnap.forEach((d) => batch.delete(d.ref));
            const frToSnap = await getDocs(
                query(collection(db, "friendRequests"), where("toUid", "==", uid))
            );
            frToSnap.forEach((d) => batch.delete(d.ref));

            // 4. Delete friends sub-collection entries
            const friendsSnap = await getDocs(collection(db, "users", uid, "friends"));
            friendsSnap.forEach((d) => batch.delete(d.ref));

            // 5. Delete user profile doc
            batch.delete(doc(db, "users", uid));

            await batch.commit();

            // 6. Delete Firebase Auth account (requires recent sign-in)
            await deleteUser(auth.currentUser);

            // Redirect to home
            router.replace("/");
        } catch (err: any) {
            console.error("Delete account error:", err);
            if (err.code === "auth/requires-recent-login") {
                setDeleteError("For security, please sign out and sign in again before deleting your account.");
            } else {
                setDeleteError("Failed to delete account. Please try again.");
            }
            setIsDeleting(false);
        }
    }

    const joinedDate = user
        ? auth.currentUser?.metadata?.creationTime
            ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString()
            : "Unknown"
        : "—";

    if (!user) return <LoadingGrid fullPage size="lg" label="Loading account..." />;

    // Only show trash tab for owners
    const isOwner = user.accountType === "owner";

    return (
        <div className="min-h-screen bg-sheet-bg text-sheet-text">
            <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

            {/* Header */}
            <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
                <button
                    onClick={() => router.back()}
                    className="group flex items-center gap-2 text-sheet-muted hover:text-sheet-accent transition-colors text-sm font-medium"
                >
                    <div className="w-8 h-8 rounded-lg border border-sheet-border bg-white flex items-center justify-center group-hover:border-sheet-accent/40 group-hover:bg-sheet-accent/5 transition-all">
                        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                    <span>Back to Hub</span>
                </button>
                <div className="flex items-center gap-2">
                    <UserCircle size={16} className="text-sheet-accent" />
                    <span className="font-semibold text-sm text-sheet-text">Account</span>
                </div>
            </header>

            {/* Body */}
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
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] bg-sheet-accent/10 text-sheet-accent font-semibold px-3 py-1 rounded-full">
                            {user.isAnonymous ? "Guest" : "Google Account"}
                        </span>
                        {user.accountType && (
                            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${user.accountType === "owner" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                {user.accountType === "owner" ? "Owner" : "Non-Owner"}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-4 rounded-2xl border border-sheet-border bg-white/80 p-2 flex gap-2 overflow-x-auto">
                    <button
                        className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${activeTab === "about" ? "bg-sheet-accent text-white" : "text-sheet-text hover:bg-sheet-bg"}`}
                        onClick={() => setActiveTab("about")}
                    >About</button>
                    <button
                        className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap flex items-center gap-1.5 ${activeTab === "formulas" ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50 border border-indigo-200"}`}
                        onClick={() => setActiveTab("formulas")}
                    >
                        <BookOpen size={13} />
                        Formulas & Settings
                    </button>
                    <button
                        className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${activeTab === "friends" ? "bg-sheet-accent text-white" : "text-sheet-text hover:bg-sheet-bg"}`}
                        onClick={() => setActiveTab("friends")}
                    >Friends</button>
                    {isOwner && (
                        <button
                            className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap flex items-center gap-1.5 ${activeTab === "trash" ? "bg-amber-600 text-white" : "text-amber-700 hover:bg-amber-50 border border-amber-200"}`}
                            onClick={() => setActiveTab("trash")}
                        >
                            <Trash2 size={13} />
                            Deleted Sheets
                        </button>
                    )}
                </div>

                {/* Tab Content */}
                {activeTab === "about" && (
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
                        {/* Factory Name Edit Card */}
                        <div className="bg-white rounded-2xl border border-sheet-border px-5 py-4 shadow-sm flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                        <Building2 size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-0.5">Factory Name</p>
                                        {!editingFactory ? (
                                            <p className="text-sm font-semibold text-sheet-text truncate">{user.factoryName || "Not set"}</p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={factoryValue}
                                                onChange={(e) => setFactoryValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSaveFactory();
                                                    if (e.key === "Escape") handleCancelFactory();
                                                }}
                                                placeholder="Enter Factory Name (e.g. Valley Stone)"
                                                className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-indigo-500 transition-colors"
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!editingFactory ? (
                                        <button
                                            onClick={() => setEditingFactory(true)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                        >
                                            <Pencil size={14} />
                                            Edit
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleSaveFactory}
                                                disabled={savingFactory}
                                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                            >
                                                <Check size={14} />
                                                Save
                                            </button>
                                            <button
                                                onClick={handleCancelFactory}
                                                disabled={savingFactory}
                                                className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {factoryError && (
                                <p className="text-xs text-red-500">{factoryError}</p>
                            )}
                        </div>

                        {/* Phone Number Edit Card */}
                        <div className="bg-white rounded-2xl border border-sheet-border px-5 py-4 shadow-sm flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <Phone size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] uppercase tracking-widest font-bold text-sheet-muted mb-0.5">Phone Number</p>
                                        {!editingPhone ? (
                                            <p className="text-sm font-semibold text-sheet-text truncate">{user.phoneNumber || "Not set"}</p>
                                        ) : (
                                            <input
                                                type="tel"
                                                value={phoneValue}
                                                onChange={(e) => {
                                                    setPhoneValue(e.target.value);
                                                    setPhoneError("");
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSavePhone();
                                                    if (e.key === "Escape") handleCancelPhone();
                                                }}
                                                placeholder="Enter Phone Number (e.g. +91 98765 43210)"
                                                className="w-full bg-sheet-bg border border-sheet-border rounded-lg px-3 py-2 text-sm text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-blue-500 transition-colors"
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!editingPhone ? (
                                        <button
                                            onClick={() => setEditingPhone(true)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                        >
                                            <Pencil size={14} />
                                            Edit
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleSavePhone}
                                                disabled={savingPhone}
                                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                                            >
                                                <Check size={14} />
                                                Save
                                            </button>
                                            <button
                                                onClick={handleCancelPhone}
                                                disabled={savingPhone}
                                                className="inline-flex items-center gap-2 rounded-lg border border-sheet-border px-3 py-2 text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {phoneError && (
                                <p className="text-xs text-red-500">{phoneError}</p>
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

                        {/* ── Danger Zone ── */}
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-5 space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldAlert size={16} className="text-red-500" />
                                <span className="text-sm font-bold text-red-600">Danger Zone</span>
                            </div>
                            <p className="text-xs text-red-500 leading-relaxed">
                                Deleting your account is <strong>permanent and irreversible</strong>. All your measurement sheets,
                                spreadsheets, and profile data will be permanently erased.
                            </p>
                            <button
                                onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setDeleteError(""); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95"
                            >
                                <Trash2 size={14} />
                                Delete Account
                            </button>
                        </div>
                    </div>
                )}
                {activeTab === "formulas" && (
                    <div className="space-y-4">
                        {/* Section 1: Factory Name Settings */}
                        <div className="bg-white rounded-2xl border border-sheet-border p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                    <Building2 size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-800">Factory Name & Branding</h3>
                                    <p className="text-xs text-slate-500">Configured factory name appears in all PDF exports and measurement reports.</p>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-600">Current Factory Name:</span>
                                <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                                    {user.factoryName || "Not set"}
                                </span>
                            </div>
                        </div>

                        {/* Section 2: Mathematical Formulas */}
                        <div className="bg-white rounded-2xl border border-sheet-border p-5 shadow-sm space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-800">Measurement Formulas</h3>
                                    <p className="text-xs text-slate-500">Exact formulas used across Local, National, and Cutting sheets</p>
                                </div>
                            </div>

                            <div className="space-y-3 pt-2">
                                {/* Local SQF */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-slate-800">1. Local SQF (Square Feet)</span>
                                        <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Local</span>
                                    </div>
                                    <p className="text-xs font-mono font-semibold text-slate-700 bg-white p-2 rounded border border-slate-200">
                                        SQF = (Length in inches × Height in inches) ÷ 144
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        144 square inches equals 1 square foot (12" × 12").
                                    </p>
                                </div>

                                {/* National SQF */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-slate-800">2. National SQF (Inches)</span>
                                        <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">National</span>
                                    </div>
                                    <p className="text-xs font-mono font-semibold text-slate-700 bg-white p-2 rounded border border-slate-200">
                                        SQF = (Length in inches [Col A] × Height in inches [Col C]) ÷ 144
                                    </p>
                                </div>

                                {/* National SQF CM */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-slate-800">3. National SQF (Centimeters)</span>
                                        <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">National CM</span>
                                    </div>
                                    <p className="text-xs font-mono font-semibold text-slate-700 bg-white p-2 rounded border border-slate-200">
                                        SQF (CM) = (Length in cm [Col B] × Height in cm [Col D]) ÷ 929
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        929 sq cm is the conversion constant for 1 square foot (approx. 929.03 cm²).
                                    </p>
                                </div>

                                {/* Cutting SQF */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-slate-800">4. Cutting Sheet SQF</span>
                                        <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Cutting</span>
                                    </div>
                                    <p className="text-xs font-mono font-semibold text-slate-700 bg-white p-2 rounded border border-slate-200">
                                        SQF = [(Length in inches × Height in inches) ÷ 144] × Number of Slabs
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: System Rules & PDF Exports */}
                        <div className="bg-white rounded-2xl border border-sheet-border p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-800">PDF & Export Format</h3>
                                    <p className="text-xs text-slate-500">Structure of generated reports and spreadsheets</p>
                                </div>
                            </div>

                            <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside pt-1">
                                <li><strong>30-Row Pagination:</strong> PDFs split long sheets into chunks of 30 rows per page with page subtotals.</li>
                                <li><strong>Factory Header:</strong> Displays your registered Factory Name prominently at the top header banner.</li>
                                <li><strong>Grand Totals:</strong> Displays exact Grand Overall Totals (SQF and SQF CM) at the bottom.</li>
                                <li><strong>Excel Exports:</strong> Cleanly aligned cells, auto-fitted column widths, and omitted empty rows.</li>
                            </ul>
                        </div>

                        {/* Section 4: Permissions & Lock Rules */}
                        <div className="bg-white rounded-2xl border border-sheet-border p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-800">Permissions & Past Day Lock</h3>
                                    <p className="text-xs text-slate-500">Access control rules for owners and workers</p>
                                </div>
                            </div>

                            <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside pt-1">
                                <li><strong>Owners:</strong> Have full view and edit control over all current and past measurement sheets.</li>
                                <li><strong>Past Day Auto-Lock:</strong> Non-owners are set to View-Only after the day completes.</li>
                                <li><strong>Re-Enabling Worker Access:</strong> Owners can open the sheet's <em>"Change"</em> section and grant explicit <em>"Can Modify"</em> permissions to allow worker edits on past days.</li>
                                <li><strong>Trash & Recovery:</strong> Soft-deleted sheets stay in Trash for 5 days before permanent cleanup.</li>
                            </ul>
                        </div>
                    </div>
                )}

                {activeTab === "friends" && (
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

                {activeTab === "trash" && isOwner && (
                    <TrashTab uid={user.uid} displayName={user.displayName} />
                )}

                <div className="mt-6">
                    <p className="text-xs text-sheet-muted text-center leading-relaxed">
                        Nicknames are visible to collaborators in spreadsheets and chats.<br />
                        Max 32 characters. Must be unique across all users.
                    </p>
                </div>
            </main>

            {/* ── Delete Account Confirmation Modal ── */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white border border-red-200 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
                        {/* Header */}
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                <ShieldAlert size={22} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-800">Delete Account Permanently?</h2>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                    This will permanently delete your account and <strong>all data</strong> including measurement sheets,
                                    spreadsheets, and your profile. This action <strong>cannot be undone</strong>.
                                </p>
                            </div>
                        </div>

                        {/* What gets deleted */}
                        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 space-y-1.5">
                            <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-2">What will be deleted</p>
                            {[
                                "Your user profile and nickname",
                                "All measurement sheets you created",
                                "All spreadsheet documents you created",
                                "All friend requests and connections",
                                "Your Firebase authentication account",
                            ].map((item) => (
                                <div key={item} className="flex items-center gap-2 text-xs text-red-700">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                    {item}
                                </div>
                            ))}
                        </div>

                        {/* Type DELETE to confirm */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                                Type <span className="font-mono text-red-600 bg-red-50 px-1 rounded">DELETE</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Type DELETE here..."
                                disabled={isDeleting}
                                className="w-full bg-white border border-slate-200 focus:border-red-400 rounded-xl px-3 py-2.5 text-sm outline-none font-mono transition-colors disabled:opacity-50"
                                autoFocus
                            />
                        </div>

                        {/* Error message */}
                        {deleteError && (
                            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-600">
                                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                {deleteError}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); setDeleteError(""); }}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                            >
                                {isDeleting ? (
                                    <><Loader2 size={15} className="animate-spin" /> Deleting...</>
                                ) : (
                                    <><Trash2 size={15} /> Delete Forever</>
                                )}
                            </button>
                        </div>
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
                <p className="text-sm font-semibold text-sheet-text break-all">{value}</p>
            </div>
        </div>
    );
}

export default function AccountPage() {
    return (
        <Suspense fallback={<LoadingGrid fullPage size="lg" label="Loading account..." />}>
            <AccountPageContent />
        </Suspense>
    );
}