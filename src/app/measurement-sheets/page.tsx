"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ruler,
  Plus,
  Search,
  Trash2,
  Copy,
  Edit2,
  Star,
  ArrowLeft,
  X,
  User,
  Users,
  Calendar,
  Filter,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  Bell,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { UserSelectDropdown } from "@/components/ui/UserSelectDropdown";
import { db } from "@/lib/firebase/client";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import type {
  MeasurementSheet,
  PersonType,
  LocationType,
  SheetType,
  PersonMeasurement,
} from "@/types";
import { AppSwitcher } from "@/components/ui/AppSwitcher";
import { format } from "date-fns";

interface SelectedPerson {
  userId: string;
  name: string;
}

const EMPTY_ROWS = Array.from({ length: 5 }, (_, i) => ({
  rowNumber: i + 1,
  A: null,
  B: null,
  C: null,
  D: null,
  E: null,
}));

export default function MeasurementSheetsDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [personTypeFilter, setPersonTypeFilter] = useState<string>("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "modified">("newest");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingSheet, setRenamingSheet] = useState<{ id: string; title: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [statusModalSheet, setStatusModalSheet] = useState<MeasurementSheet | null>(null);

  // Create Form State
  const [formDate, setFormDate] = useState(format(new Date(), "dd-MMM-yyyy"));
  const [formPersonType, setFormPersonType] = useState<PersonType | null>(null);
  const [formLocationType, setFormLocationType] = useState<LocationType | null>(null);
  const [formSheetType, setFormSheetType] = useState<SheetType | null>(null);
  const [singleName, setSingleName] = useState("");
  const [numPeople, setNumPeople] = useState<number | "">(2);
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([{ userId: "", name: "" }, { userId: "", name: "" }]);
  const [isCreating, setIsCreating] = useState(false);

  // Subscribe to sheets where user is creator OR is in participantIds
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "measurementSheets"),
      where("participantIds", "array-contains", user.uid)
    );
    const qOwner = query(
      collection(db, "measurementSheets"),
      where("userId", "==", user.uid)
    );

    const allSheets = new Map<string, MeasurementSheet>();

    const unsub1 = onSnapshot(qOwner, (snap) => {
      snap.docs.forEach((d) => {
        allSheets.set(d.id, { id: d.id, ...d.data() } as MeasurementSheet);
      });
      // Remove docs where user was removed
      allSheets.forEach((_, id) => {
        if (!snap.docs.find((d) => d.id === id)) {
          // Only remove owner docs
        }
      });
      setSheets(Array.from(allSheets.values()));
      setLoading(false);
    }, (err) => {
      console.error("Error loading measurement sheets (owner):", err);
      setLoading(false);
    });

    const unsub2 = onSnapshot(q, (snap) => {
      snap.docs.forEach((d) => {
        allSheets.set(d.id, { id: d.id, ...d.data() } as MeasurementSheet);
      });
      setSheets(Array.from(allSheets.values()));
      setLoading(false);
    }, (err) => {
      console.error("Error loading measurement sheets (participant):", err);
    });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  // Handle number of people input change for Multiple type
  const handleNumPeopleChange = (valStr: string) => {
    if (valStr === "") {
      setNumPeople("");
      return;
    }
    const count = parseInt(valStr, 10);
    if (isNaN(count)) return;
    const val = Math.max(1, Math.min(20, count));
    setNumPeople(val);
    setSelectedPeople((prev) => {
      const next = [...prev];
      while (next.length < val) next.push({ userId: "", name: "" });
      next.length = val;
      return next;
    });
  };

  const handlePersonSelect = (index: number, userId: string, name: string) => {
    setSelectedPeople((prev) => {
      const next = [...prev];
      next[index] = { userId, name };
      return next;
    });
  };

  const effectiveSheetType = formPersonType === "worker" ? "multiple" : formSheetType;
  const effectiveLocationType = formPersonType === "worker" ? "local" : formLocationType;

  // Form Validation - all selected people must be valid & unique, no duplicates
  const isFormValid = (() => {
    if (!formPersonType) return false;
    if (formPersonType === "customer") {
      if (!formLocationType || !formSheetType) return false;
    }
    if (effectiveSheetType === "private") {
      return singleName.trim().length > 0;
    } else {
      const np = typeof numPeople === "number" ? numPeople : 0;
      if (np <= 0) return false;
      const people = selectedPeople.slice(0, np);
      // All must have a userId selected
      if (!people.every((p) => p.userId && p.name)) return false;
      // No duplicates
      const ids = people.map((p) => p.userId);
      return new Set(ids).size === ids.length;
    }
  })();

  const resetForm = () => {
    setFormDate(format(new Date(), "dd-MMM-yyyy"));
    setFormPersonType(null);
    setFormLocationType(null);
    setFormSheetType(null);
    setSingleName("");
    setNumPeople(2);
    setSelectedPeople([{ userId: "", name: "" }, { userId: "", name: "" }]);
  };

  // Create new Measurement Sheet
  const handleCreateSheet = async () => {
    if (!user || !isFormValid || isCreating) return;
    setIsCreating(true);

    const np = typeof numPeople === "number" ? numPeople : 1;

    let people: PersonMeasurement[];
    let participantIds: string[] = [user.uid];

    if (effectiveSheetType === "private") {
      people = [{ name: singleName.trim(), rows: [...EMPTY_ROWS] }];
    } else {
      const chosenPeople = selectedPeople.slice(0, np);
      people = chosenPeople.map((p) => ({
        name: p.name,
        userId: p.userId,
        status: "pending" as const,
        rows: [...EMPTY_ROWS],
      }));
      participantIds = [user.uid, ...chosenPeople.map((p) => p.userId)];
    }

    const titleName =
      effectiveSheetType === "private"
        ? singleName.trim()
        : `${formPersonType === "worker" ? "Workers" : "Customers"} (${people.length})`;

    const docData = {
      userId: user.uid,
      creatorName: user.displayName,
      title: `${titleName} Measurements`,
      date: formDate,
      personType: formPersonType,
      locationType: effectiveLocationType,
      sheetType: effectiveSheetType,
      people,
      participantIds,
      total: 0,
      favorite: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "measurementSheets"), docData);
      setShowCreateModal(false);
      resetForm();
      setIsCreating(false);
      router.push(`/measurement-sheets/${docRef.id}`);
    } catch (err) {
      console.error("Error creating measurement sheet:", err);
      setIsCreating(false);
    }
  };

  // Accept/Decline a pending request
  const handleAcceptRequest = async (sheet: MeasurementSheet) => {
    if (!user) return;
    try {
      const updatedPeople = sheet.people.map((p) =>
        p.userId === user.uid ? { ...p, status: "accepted" as const } : p
      );
      await updateDoc(doc(db, "measurementSheets", sheet.id), {
        people: updatedPeople,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error accepting request:", err);
    }
  };

  const handleDeclineRequest = async (sheet: MeasurementSheet) => {
    if (!user) return;
    try {
      const updatedPeople = sheet.people.map((p) =>
        p.userId === user.uid ? { ...p, status: "declined" as const } : p
      );
      // Also remove from participantIds so they lose access
      const updatedParticipantIds = (sheet.participantIds || []).filter(
        (id) => id !== user.uid
      );
      await updateDoc(doc(db, "measurementSheets", sheet.id), {
        people: updatedPeople,
        participantIds: updatedParticipantIds,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error declining request:", err);
    }
  };

  // Delete Sheet
  const handleDeleteSheet = async (id: string) => {
    try {
      await deleteDoc(doc(db, "measurementSheets", id));
      setDeletingId(null);
    } catch (err) {
      console.error("Error deleting measurement sheet:", err);
    }
  };

  // Duplicate Sheet
  const handleDuplicateSheet = async (sheet: MeasurementSheet) => {
    if (!user) return;
    try {
      const copyData = {
        userId: user.uid,
        creatorName: user.displayName,
        title: `${sheet.title} (Copy)`,
        date: format(new Date(), "dd-MMM-yyyy"),
        personType: sheet.personType,
        locationType: sheet.locationType,
        sheetType: sheet.sheetType,
        people: JSON.parse(JSON.stringify(sheet.people)),
        participantIds: [user.uid],
        total: sheet.total || 0,
        favorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, "measurementSheets"), copyData);
    } catch (err) {
      console.error("Error duplicating sheet:", err);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (sheet: MeasurementSheet) => {
    try {
      await updateDoc(doc(db, "measurementSheets", sheet.id), {
        favorite: !sheet.favorite,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error toggling favorite:", err);
    }
  };

  // Rename Sheet
  const handleRenameSubmit = async () => {
    if (!renamingSheet || !renameInput.trim()) return;
    try {
      await updateDoc(doc(db, "measurementSheets", renamingSheet.id), {
        title: renameInput.trim(),
        updatedAt: serverTimestamp(),
      });
      setRenamingSheet(null);
    } catch (err) {
      console.error("Error renaming sheet:", err);
    }
  };

  // Separate sheets: own vs pending vs accessible
  const mySheets = sheets.filter((s) => s.userId === user?.uid);

  const pendingSheets = sheets.filter((s) => {
    if (s.userId === user?.uid) return false;
    const myEntry = s.people?.find((p) => p.userId === user?.uid);
    return myEntry?.status === "pending";
  });

  const acceptedSharedSheets = sheets.filter((s) => {
    if (s.userId === user?.uid) return false;
    const myEntry = s.people?.find((p) => p.userId === user?.uid);
    return myEntry?.status === "accepted";
  });

  // Filtering & Sorting (only on own sheets + accepted shared)
  const sheetsToDisplay = [...mySheets, ...acceptedSharedSheets];
  const filteredSheets = sheetsToDisplay
    .filter((s) => {
      if (personTypeFilter !== "all" && s.personType !== personTypeFilter) return false;
      if (locationTypeFilter !== "all" && s.locationType !== locationTypeFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchDate = s.date.toLowerCase().includes(q);
      const matchPeople = s.people.some((p) => p.name.toLowerCase().includes(q));
      return matchTitle || matchDate || matchPeople;
    })
    .sort((a, b) => {
      if (sortBy === "oldest") {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      }
      if (sortBy === "modified") {
        const at = a.updatedAt?.toMillis?.() ?? 0;
        const bt = b.updatedAt?.toMillis?.() ?? 0;
        return bt - at;
      }
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });

  const getAlreadySelectedIds = (currentIndex: number): string[] => {
    const np = typeof numPeople === "number" ? numPeople : 0;
    return selectedPeople
      .slice(0, np)
      .filter((_, i) => i !== currentIndex)
      .map((p) => p.userId)
      .filter(Boolean);
  };

  if (!user) return <LoadingGrid fullPage size="lg" label="Loading Measurement Workspace..." />;

  const statusColor = (status?: string) => {
    if (status === "accepted") return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (status === "declined") return "text-red-500 bg-red-50 border-red-200";
    return "text-amber-600 bg-amber-50 border-amber-200";
  };
  const statusLabel = (status?: string) => {
    if (status === "accepted") return "Accepted";
    if (status === "declined") return "Declined";
    return "Pending";
  };

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
      <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/hub"
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <AppSwitcher currentApp="measurement-sheets" />
        </div>
        <div className="flex items-center gap-3">
          {/* User name display */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sheet-border bg-white/60 text-xs font-medium text-sheet-text">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
              {user.displayName?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span>{user.displayName}</span>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-95"
          >
            <Plus size={16} />
            <span>New Measurement Sheet</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        {/* Title Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-sheet-text flex items-center gap-2">
              <Ruler className="text-emerald-600" size={24} />
              Measurement Sheets Dashboard
            </h1>
            <p className="text-xs text-sheet-muted mt-1">
              Manage local & national dimension logs for workers and customers.
            </p>
          </div>
        </div>

        {/* ── PENDING REQUESTS ─────────────────────────────────── */}
        {pendingSheets.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-sheet-text flex items-center gap-2 mb-3">
              <Bell size={16} className="text-amber-500" />
              Pending Requests
              <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendingSheets.length}
              </span>
            </h2>
            <div className="space-y-3">
              {pendingSheets.map((s) => (
                <div
                  key={s.id}
                  className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created by: <span className="font-semibold">{(s as any).creatorName || "Unknown"}</span>
                      &nbsp;·&nbsp;Date: {s.date}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {s.personType}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {s.locationType}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDeclineRequest(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={14} />
                      Decline
                    </button>
                    <button
                      onClick={() => handleAcceptRequest(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <CheckCircle size={14} />
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search, Filter & Sort Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-6 bg-sheet-surface p-3 rounded-2xl border border-sheet-border shadow-sm">
          <div className="relative w-full md:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sheet-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by person, date, title…"
              className="w-full bg-sheet-bg border border-sheet-border rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-sheet-muted hover:text-sheet-text">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center gap-1.5 bg-sheet-bg border border-sheet-border px-2.5 py-1.5 rounded-xl text-xs">
              <Filter size={13} className="text-sheet-muted" />
              <select value={personTypeFilter} onChange={(e) => setPersonTypeFilter(e.target.value)} className="bg-transparent outline-none text-xs font-medium cursor-pointer">
                <option value="all">All People</option>
                <option value="worker">Workers Only</option>
                <option value="customer">Customers Only</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 bg-sheet-bg border border-sheet-border px-2.5 py-1.5 rounded-xl text-xs">
              <select value={locationTypeFilter} onChange={(e) => setLocationTypeFilter(e.target.value)} className="bg-transparent outline-none text-xs font-medium cursor-pointer">
                <option value="all">All Locations</option>
                <option value="local">Local Only</option>
                <option value="national">National Only</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 bg-sheet-bg border border-sheet-border px-2.5 py-1.5 rounded-xl text-xs">
              <ArrowUpDown size={13} className="text-sheet-muted" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-transparent outline-none text-xs font-medium cursor-pointer">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="modified">Recently Modified</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sheets Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-sheet-surface border border-sheet-border animate-pulse" />)}
          </div>
        ) : filteredSheets.length === 0 ? (
          <div className="text-center py-20 bg-sheet-surface rounded-2xl border border-sheet-border">
            <Ruler size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-sheet-text">
              {search || personTypeFilter !== "all" || locationTypeFilter !== "all"
                ? "No measurement sheets match your filters"
                : "No measurement sheets created yet"}
            </p>
            <p className="text-xs text-sheet-muted mt-1 max-w-sm mx-auto">
              Create your first measurement sheet to log worker and customer dimensions.
            </p>
            <button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Plus size={15} /><span>Create New Sheet</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSheets.map((s) => {
              const isOwner = s.userId === user.uid;
              const myParticipantEntry = s.people?.find((p) => p.userId === user?.uid);
              const hasMultipleParticipants = s.sheetType === "multiple" && s.people?.some((p) => p.status !== undefined);

              const canOpen = isOwner || myParticipantEntry?.status === "accepted";

              return (
                <div
                  key={s.id}
                  onClick={() => canOpen && router.push(`/measurement-sheets/${s.id}`)}
                  className={`group relative bg-sheet-surface border border-sheet-border hover:border-emerald-500/40 rounded-2xl p-5 hover:shadow-xl transition-all duration-200 flex flex-col justify-between ${canOpen ? "cursor-pointer" : "cursor-not-allowed opacity-75"}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${s.locationType === "local" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-blue-500/10 text-blue-600 border border-blue-500/20"}`}>
                          {s.locationType}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-600 border border-slate-500/20">
                          {s.personType}
                        </span>
                        {!isOwner && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600">
                            Shared
                          </span>
                        )}
                      </div>
                      {isOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(s); }}
                          className="p-1 text-slate-400 hover:text-amber-500 transition-colors"
                        >
                          <Star size={16} className={s.favorite ? "fill-amber-400 text-amber-400" : ""} />
                        </button>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-sheet-text mb-1 truncate group-hover:text-emerald-600 transition-colors">
                      {s.title}
                    </h3>

                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                      <Calendar size={13} />
                      <span>{s.date}</span>
                    </div>

                    <div className="text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-xl border border-sheet-border/60">
                      <div className="flex items-center gap-1 font-medium text-[11px] text-slate-400 mb-1">
                        {s.sheetType === "private" ? <User size={12} /> : <Users size={12} />}
                        <span>{s.people.length === 1 ? "Person:" : `People (${s.people.length}):`}</span>
                      </div>
                      <p className="truncate font-semibold text-slate-700">{s.people.map((p) => p.name).join(", ")}</p>
                    </div>

                    {/* Participant Status (for owner) */}
                    {isOwner && hasMultipleParticipants && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setStatusModalSheet(s); }}
                        className="w-full text-left text-[10px] text-slate-500 hover:text-emerald-600 flex items-center gap-1 mb-2"
                      >
                        <Users size={10} />
                        View participant status
                        <ChevronDown size={10} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-sheet-border pt-3 mt-2 text-xs">
                    <div className="font-mono text-emerald-600 font-bold text-xs">
                      TOTAL: {(s.total || 0).toFixed(2)}
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingSheet({ id: s.id, title: s.title }); setRenameInput(s.title); }}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                          title="Rename"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicateSheet(s); }}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                          title="Duplicate"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                          className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── CREATE NEW SHEET MODAL ──────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-sheet-border pb-3">
              <h2 className="text-lg font-bold text-sheet-text flex items-center gap-2">
                <Ruler size={20} className="text-emerald-600" />
                New Measurement Sheet
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted">
                <X size={18} />
              </button>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Date (Auto-generated)</label>
              <input
                type="text"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-slate-50 border border-sheet-border rounded-xl px-3 py-2 text-xs font-mono text-slate-700 outline-none"
              />
            </div>

            {/* Person Type */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">
                Select Person Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setFormPersonType("worker"); setFormLocationType(null); setFormSheetType(null); }}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${formPersonType === "worker" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}
                >
                  <User size={16} />Worker
                </button>
                <button
                  type="button"
                  onClick={() => setFormPersonType("customer")}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${formPersonType === "customer" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}
                >
                  <Users size={16} />Customer
                </button>
              </div>
            </div>

            {/* Measurement Type & Sheet Type (Customers Only) */}
            {formPersonType === "customer" && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Select Measurement Type (Local or National?) <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setFormLocationType("local")}
                      className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all ${formLocationType === "local" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      <span className="text-sm font-bold">Local</span>
                      <span className="text-[10px] font-normal text-slate-500">Columns A (Length), B (Height), C (Calculated)</span>
                    </button>
                    <button type="button" onClick={() => setFormLocationType("national")}
                      className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all ${formLocationType === "national" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      <span className="text-sm font-bold">National</span>
                      <span className="text-[10px] font-normal text-slate-500">Columns A, B (CM), C, D (CM), E (Calculated)</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Select Sheet Type (Private or Multiple?) <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setFormSheetType("private")}
                      className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all ${formSheetType === "private" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      <span className="text-sm font-bold">Private</span>
                      <span className="text-[10px] font-normal text-slate-500">Single person measurements</span>
                    </button>
                    <button type="button" onClick={() => setFormSheetType("multiple")}
                      className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all ${formSheetType === "multiple" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      <span className="text-sm font-bold">Multiple</span>
                      <span className="text-[10px] font-normal text-slate-500">Multiple people tabs</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Name Fields */}
            {effectiveSheetType === "private" && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={`Enter ${formPersonType || "person"} name…`}
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            )}

            {effectiveSheetType === "multiple" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Number of People <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={numPeople}
                    onChange={(e) => handleNumPeopleChange(e.target.value)}
                    className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedPeople.slice(0, typeof numPeople === "number" ? numPeople : 0).map((person, i) => (
                    <div key={i}>
                      <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                        Person {i + 1} <span className="text-red-500">*</span>
                        <span className="ml-1 text-slate-400">(select from registered users)</span>
                      </label>
                      <UserSelectDropdown
                        value={person.userId}
                        onChange={(userId, name) => handlePersonSelect(i, userId, name)}
                        excludeUserIds={getAlreadySelectedIds(i)}
                        placeholder={`Select Person ${i + 1}...`}
                      />
                    </div>
                  ))}
                </div>

                {/* Validation hint for duplicates */}
                {(() => {
                  const np = typeof numPeople === "number" ? numPeople : 0;
                  const ids = selectedPeople.slice(0, np).map((p) => p.userId).filter(Boolean);
                  const hasDupes = new Set(ids).size !== ids.length;
                  return hasDupes ? (
                    <p className="text-xs text-red-500 font-medium">⚠ Each person must be unique. Remove duplicates to continue.</p>
                  ) : null;
                })()}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-sheet-border pt-4">
              <button type="button" onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border transition-colors">
                Cancel
              </button>
              <button
                type="button"
                disabled={!isFormValid || isCreating}
                onClick={handleCreateSheet}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-40 transition-all active:scale-95"
              >
                {isCreating ? "Creating…" : "Create Sheet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PARTICIPANT STATUS MODAL ──────────────────────────────────────── */}
      {statusModalSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-sheet-text flex items-center gap-2">
                <Users size={16} className="text-emerald-600" />
                Participant Status
              </h3>
              <button onClick={() => setStatusModalSheet(null)} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 -mt-1">{statusModalSheet.title}</p>
            <div className="space-y-2">
              {statusModalSheet.people.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-sheet-border/60">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{p.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusColor(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setStatusModalSheet(null)} className="w-full px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ─────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-sheet-text">Delete Measurement Sheet?</h3>
            <p className="text-xs text-slate-500">Are you sure you want to delete this measurement sheet? This action cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border">Cancel</button>
              <button onClick={() => handleDeleteSheet(deletingId)} className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RENAME MODAL ─────────────────────────────────────────────────── */}
      {renamingSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-sheet-text">Rename Sheet</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
              autoFocus
              className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setRenamingSheet(null)} className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border">Cancel</button>
              <button onClick={handleRenameSubmit} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .grid-mesh { background-image: linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px); background-size: 60px 60px; animation: grid-scroll 20s linear infinite; }
        @keyframes grid-scroll { from { background-position: 0 0; } to { background-position: 60px 60px; } }
      `}</style>
    </div>
  );
}
