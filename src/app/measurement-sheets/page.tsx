"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  ArrowRight,
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
  Timestamp,
} from "firebase/firestore";
import type {
  MeasurementSheet,
  PersonType,
  LocationType,
  SheetCategory,
  SheetType,
  PersonMeasurement,
  WorkerPermissions,
} from "@/types";
import { AppSwitcher } from "@/components/ui/AppSwitcher";
import { format } from "date-fns";
import {
  getAutoDeleteTimestamp,
  isSheetPastRetention,
  purgeExpiredOwnerSheets,
} from "@/lib/measurementRetention";
import { calculateSheetTotal } from "@/lib/measurementExport";

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

const DEFAULT_WORKER_PERMISSIONS: WorkerPermissions = {
  canView: true,
  canModifyMeasurements: true,
  canModifySerialNumbers: false,
  canModifyRemarks: true,
  canAddRows: true,
  canDeleteRows: false,
};

const READONLY_WORKER_PERMISSIONS: WorkerPermissions = {
  canView: true,
  canModifyMeasurements: false,
  canModifySerialNumbers: false,
  canModifyRemarks: false,
  canAddRows: false,
  canDeleteRows: false,
};

function getDefaultPermissionsForDate(dateISO?: string | null): WorkerPermissions {
  const todayISO = format(new Date(), "yyyy-MM-dd");
  if (dateISO && todayISO > dateISO) {
    return { ...READONLY_WORKER_PERMISSIONS };
  }
  return { ...DEFAULT_WORKER_PERMISSIONS };
}

/** Cutting sheets keep machines in `people`; invitees live in invitedWorkers / cuttingData.polishes. */
function getCuttingInvitees(sheet: MeasurementSheet): PersonMeasurement[] {
  const byUserId = new Map<string, PersonMeasurement>();

  for (const p of sheet.cuttingData?.polishes || []) {
    if (!p.userId) continue;
    byUserId.set(p.userId, {
      name: p.name,
      userId: p.userId,
      status: p.status || "pending",
      permissions: p.permissions || DEFAULT_WORKER_PERMISSIONS,
      rows: [],
    });
  }

  for (const p of sheet.invitedWorkers || []) {
    if (!p.userId) continue;
    const existing = byUserId.get(p.userId);
    byUserId.set(p.userId, {
      name: p.name,
      userId: p.userId,
      status: p.status || existing?.status || "pending",
      permissions: p.permissions || existing?.permissions || DEFAULT_WORKER_PERMISSIONS,
      rows: [],
    });
  }

  return Array.from(byUserId.values());
}

function parseSheetDateISO(dateStr: string): string {
  if (!dateStr) return format(new Date(), "yyyy-MM-dd");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, "yyyy-MM-dd");
    }
  } catch (_) {}
  return format(new Date(), "yyyy-MM-dd");
}

function MeasurementDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTypeParam = searchParams.get("type") as string | null;
  const activeSheetCategory: SheetCategory | null =
    activeTypeParam === "customer"
      ? "customer"
      : activeTypeParam === "cutting"
      ? "cutting"
      : activeTypeParam === "polish" || activeTypeParam === "worker"
      ? "polish"
      : null;

  const { user } = useAuthStore();
  const userWorkType = user?.workType;

  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locationTypeFilter, setLocationTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "modified">("newest");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingSheet, setRenamingSheet] = useState<{ id: string; title: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [statusModalSheet, setStatusModalSheet] = useState<MeasurementSheet | null>(null);

  // Manage Sheet & Members state (Requirement 2)
  const [manageSheet, setManageSheet] = useState<MeasurementSheet | null>(null);
  const [manageTitle, setManageTitle] = useState("");
  const [managePeople, setManagePeople] = useState<PersonMeasurement[]>([]);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [isSavingManage, setIsSavingManage] = useState(false);

  // Create Form State
  const [formDate, setFormDate] = useState(format(new Date(), "dd-MMM-yyyy"));
  const [formPersonType, setFormPersonType] = useState<PersonType | null>(null);
  const [formLocationType, setFormLocationType] = useState<LocationType | null>(null);
  const [formSheetType, setFormSheetType] = useState<SheetType | null>(null);
  const [singleName, setSingleName] = useState("");
  const [numPeople, setNumPeople] = useState<number | "">(2);
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([{ userId: "", name: "" }, { userId: "", name: "" }]);
  const [formNumSlabs, setFormNumSlabs] = useState("1");
  const [formNumMachines, setFormNumMachines] = useState<number | null>(3);
  const [isCreating, setIsCreating] = useState(false);

  // Subscribe to sheets with clean deletion sync
  useEffect(() => {
    if (!user) return;

    const sheetsMap = new Map<string, MeasurementSheet>();

    const publish = () => {
      const all = Array.from(sheetsMap.values()).filter((s) => !isSheetPastRetention(s));
      setSheets(all);
      setLoading(false);
    };

    // Permanently remove owner sheets older than 2 months
    if (user.accountType === "owner") {
      purgeExpiredOwnerSheets(user.uid).catch((err) =>
        console.error("Failed to purge expired measurement sheets", err)
      );
    }

    const qOwner = query(
      collection(db, "measurementSheets"),
      where("userId", "==", user.uid)
    );
    const qPart = query(
      collection(db, "measurementSheets"),
      where("participantIds", "array-contains", user.uid)
    );

    const unsub1 = onSnapshot(qOwner, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "removed") {
          sheetsMap.delete(change.doc.id);
        } else {
          const data = { id: change.doc.id, ...change.doc.data() } as MeasurementSheet;
          if (isSheetPastRetention(data)) {
            sheetsMap.delete(change.doc.id);
            if (data.userId === user.uid) {
              deleteDoc(doc(db, "measurementSheets", change.doc.id)).catch(() => undefined);
            }
          } else {
            sheetsMap.set(change.doc.id, data);
          }
        }
      });
      publish();
    });

    const unsub2 = onSnapshot(qPart, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "removed") {
          sheetsMap.delete(change.doc.id);
        } else {
          const data = { id: change.doc.id, ...change.doc.data() } as MeasurementSheet;
          if (isSheetPastRetention(data)) {
            sheetsMap.delete(change.doc.id);
          } else {
            sheetsMap.set(change.doc.id, data);
          }
        }
      });
      publish();
    });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  // Sync form defaults when modal opens or activeTypeParam changes
  useEffect(() => {
    if (activeSheetCategory === "polish") {
      setFormPersonType("worker");
      setFormLocationType("local");
      setFormSheetType("multiple");
      setFormNumSlabs("1");
      setFormNumMachines(3);
    } else if (activeSheetCategory === "customer") {
      setFormPersonType("customer");
      setFormLocationType("local");
      setFormSheetType("multiple");
      setFormNumSlabs("1");
      setFormNumMachines(3);
    } else if (activeSheetCategory === "cutting") {
      setFormPersonType("worker");
      setFormLocationType("local");
      setFormSheetType("multiple");
      setFormNumSlabs("1");
      setFormNumMachines(3);
    }
  }, [activeSheetCategory, showCreateModal]);

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

  const isMachinesValid =
    activeSheetCategory !== "cutting" ||
    (typeof formNumMachines === "number" && Number.isInteger(formNumMachines) && formNumMachines >= 1);

  // Form Validation (Starting serial removed, default 1)
  const isFormValid = (() => {
    if (!formPersonType) return false;
    if (!isMachinesValid) return false;
    if (formPersonType === "customer") {
      if (!formLocationType || !formSheetType) return false;
    }
    // Cutting sheets: only Number of Machines required; people are optional
    if (activeSheetCategory === "cutting") return true;
    if (effectiveSheetType === "private") {
      return singleName.trim().length > 0;
    } else {
      const np = typeof numPeople === "number" ? numPeople : 0;
      if (np <= 0) return false;
      const people = selectedPeople.slice(0, np);
      if (!people.every((p) => p.userId && p.name)) return false;
      const ids = people.map((p) => p.userId);
      return new Set(ids).size === ids.length;
    }
  })();

  const resetForm = () => {
    setFormDate(format(new Date(), "dd-MMM-yyyy"));
    setFormPersonType(activeSheetCategory === "customer" ? "customer" : "worker");
    setFormLocationType(activeSheetCategory === "customer" ? null : "local");
    setFormSheetType(activeSheetCategory === "customer" ? null : "multiple");
    setSingleName("");
    setNumPeople(2);
    setSelectedPeople([{ userId: "", name: "" }, { userId: "", name: "" }]);
    setFormNumSlabs("");
    setFormNumMachines(3);
  };

  // Create new Sheet
  const handleCreateSheet = async () => {
    if (!user || user.accountType === "non-owner" || !isFormValid || isCreating) return;

    const category: SheetCategory = activeSheetCategory || (formPersonType === "customer" ? "customer" : "polish");
    const np = typeof numPeople === "number" ? numPeople : 1;
    const slabsValue = formNumSlabs === "" ? 1 : Math.max(1, parseInt(formNumSlabs, 10) || 1);
    const sno = category === "customer" ? slabsValue : 1;
    const machinesValue =
      category === "cutting"
        ? (typeof formNumMachines === "number" && Number.isInteger(formNumMachines) && formNumMachines >= 1 ? formNumMachines : null)
        : 3;
    if (category === "cutting" && machinesValue === null) return;
    const safeMachinesValue = machinesValue ?? 3;

    setIsCreating(true);

    // Build initial rows with correct serial numbers starting at 1
    const buildRows = (startSno: number) =>
      Array.from({ length: 5 }, (_, i) => ({
        rowNumber: i + 1,
        serialNumber: startSno + i,
        A: null,
        B: null,
        C: null,
        D: null,
        E: null,
        remark: "",
      }));

    let people: PersonMeasurement[];
    let participantIds: string[] = [user.uid];
    const np2 = typeof numPeople === "number" ? numPeople : 0;
    const chosenPeople = selectedPeople.slice(0, np2).filter((p) => p.userId && p.name);

    const dateISO = parseSheetDateISO(formDate);
    const dateTimestamp = Timestamp.fromDate(new Date(`${dateISO}T12:00:00`));
    const defaultPerms = getDefaultPermissionsForDate(dateISO);

    if (category === "cutting") {
      // Machines stay in `people` as tabs; invited people are stored separately.
      people = Array.from({ length: safeMachinesValue }, (_, i) => ({
        name: `Machine ${i + 1}`,
        rows: buildRows(1),
      }));
      // Only add invited people who were actually selected
      const invitedIds = chosenPeople.map((p) => p.userId).filter((id): id is string => Boolean(id));
      participantIds = Array.from(new Set([user.uid, ...invitedIds]));
    } else if (effectiveSheetType === "private") {
      people = [{ name: singleName.trim(), rows: buildRows(sno) }];
    } else {
      people = chosenPeople.map((p) => ({
        name: p.name,
        userId: p.userId,
        status: "pending" as const,
        rows: buildRows(sno),
        permissions: { ...defaultPerms },
      }));
      participantIds = Array.from(new Set([user.uid, ...chosenPeople.map((p) => p.userId).filter((id): id is string => Boolean(id))]));
    }

    const titleName =
      effectiveSheetType === "private"
        ? singleName.trim()
        : category === "cutting"
        ? `Cutting – ${safeMachinesValue} Machine${safeMachinesValue !== 1 ? "s" : ""}`
        : category === "polish"
        ? `Polishes (${people.length})`
        : `Customers (${people.length})`;

    const invitedWorkers = chosenPeople.map((p) => ({
      userId: p.userId,
      name: p.name,
      status: "pending" as const,
      permissions: { ...defaultPerms },
    }));

    const docData: any = {
      userId: user.uid,
      creatorName: user.displayName || user.email || "Unknown",
      title: `${titleName} Measurements`,
      date: formDate,
      dateISO,
      dateTimestamp,
      personType: category === "customer" ? "customer" : "worker",
      sheetCategory: category,
      locationType: effectiveLocationType,
      sheetType: effectiveSheetType,
      startingSerialNumber: sno,
      numSlabs: category === "customer" ? slabsValue : 1,
      people,
      invitedWorkers,
      participantIds,
      total: 0,
      favorite: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      autoDeleteAt: getAutoDeleteTimestamp(),
      ...(category === "cutting"
        ? {
            cuttingData: {
              numMachines: safeMachinesValue,
              numPolishes: chosenPeople.length,
              polishes: chosenPeople.map((p) => ({
                userId: p.userId || "",
                name: p.name || "",
                status: "pending" as const,
                permissions: { ...defaultPerms },
              })),
              machines: Array.from({ length: safeMachinesValue }, (_, i) => ({
                id: `machine_${i + 1}`,
                name: `Machine ${i + 1}`,
                assignedRows: [],
              })),
              updatedAt: new Date().toISOString(),
            },
          }
        : {}),
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

  // Accept/Decline request
  const handleAcceptRequest = async (sheet: MeasurementSheet) => {
    if (!user) return;
    try {
      const updatedPeople = sheet.people?.map((p) =>
        p.userId === user.uid ? { ...p, status: "accepted" as const } : p
      );
      const updatedInvited = sheet.invitedWorkers?.map((p) =>
        p.userId === user.uid ? { ...p, status: "accepted" as const } : p
      );
      const updatedPolishes = sheet.cuttingData?.polishes?.map((p) =>
        p.userId === user.uid ? { ...p, status: "accepted" as const } : p
      );

      const updatePayload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (updatedPeople) updatePayload.people = updatedPeople;
      if (updatedInvited) updatePayload.invitedWorkers = updatedInvited;
      if (updatedPolishes && sheet.cuttingData) {
        updatePayload.cuttingData = {
          ...sheet.cuttingData,
          polishes: updatedPolishes,
        };
      }

      await updateDoc(doc(db, "measurementSheets", sheet.id), updatePayload);
    } catch (err) {
      console.error("Error accepting request:", err);
    }
  };

  const handleDeclineRequest = async (sheet: MeasurementSheet) => {
    if (!user) return;
    try {
      const updatedPeople = sheet.people?.map((p) =>
        p.userId === user.uid ? { ...p, status: "declined" as const } : p
      );
      const updatedInvited = sheet.invitedWorkers?.map((p) =>
        p.userId === user.uid ? { ...p, status: "declined" as const } : p
      );
      const updatedPolishes = sheet.cuttingData?.polishes?.map((p) =>
        p.userId === user.uid ? { ...p, status: "declined" as const } : p
      );
      const updatedParticipantIds = (sheet.participantIds || []).filter(
        (id) => id !== user.uid
      );

      const updatePayload: Record<string, unknown> = {
        participantIds: updatedParticipantIds,
        updatedAt: serverTimestamp(),
      };
      if (updatedPeople) updatePayload.people = updatedPeople;
      if (updatedInvited) updatePayload.invitedWorkers = updatedInvited;
      if (updatedPolishes && sheet.cuttingData) {
        updatePayload.cuttingData = {
          ...sheet.cuttingData,
          polishes: updatedPolishes,
        };
      }

      await updateDoc(doc(db, "measurementSheets", sheet.id), updatePayload);
    } catch (err) {
      console.error("Error declining request:", err);
    }
  };

  // Save Manage Members & Permissions (Requirement 2)
  const handleSaveManageSheet = async () => {
    if (!manageSheet || !user) return;
    setIsSavingManage(true);
    try {
      const isCutting = manageSheet.sheetCategory === "cutting";
      const memberIds = managePeople
        .map((p) => p.userId)
        .filter((id): id is string => Boolean(id));
      const participantIds = Array.from(new Set([user.uid, ...memberIds]));

      if (isCutting) {
        // Keep machine tabs in `people`; store invitees + permissions separately.
        const invitedWorkers = managePeople
          .filter((p) => p.userId)
          .map((p) => ({
            userId: p.userId as string,
            name: p.name,
            status: p.status || ("pending" as const),
            permissions: p.permissions || getDefaultPermissionsForDate(manageSheet.dateISO || manageSheet.date),
          }));

        await updateDoc(doc(db, "measurementSheets", manageSheet.id), {
          title: manageTitle.trim() || manageSheet.title,
          invitedWorkers,
          participantIds,
          cuttingData: {
            ...(manageSheet.cuttingData || {
              numMachines: manageSheet.people?.length || 1,
              machines: (manageSheet.people || []).map((m, i) => ({
                id: `machine_${i + 1}`,
                name: m.name || `Machine ${i + 1}`,
                assignedRows: [],
              })),
            }),
            numPolishes: invitedWorkers.length,
            polishes: invitedWorkers.map((p) => ({
              userId: p.userId,
              name: p.name,
              status: p.status,
              permissions: p.permissions,
            })),
            updatedAt: new Date().toISOString(),
          },
          updatedAt: serverTimestamp(),
        });
      } else {
        // Private sheets keep the local name/rows entry (no userId); invited people are appended.
        const localEntries = (manageSheet.people || []).filter((p) => !p.userId);
        const invitedEntries = managePeople.filter((p) => Boolean(p.userId));
        const people =
          manageSheet.sheetType === "private"
            ? [
                ...(localEntries.length > 0
                  ? localEntries
                  : [
                      {
                        name: manageTitle.trim() || manageSheet.title,
                        rows: manageSheet.people?.[0]?.rows || [],
                      },
                    ]),
                ...invitedEntries,
              ]
            : managePeople;

        await updateDoc(doc(db, "measurementSheets", manageSheet.id), {
          title: manageTitle.trim() || manageSheet.title,
          people,
          participantIds,
          updatedAt: serverTimestamp(),
        });
      }
      setManageSheet(null);
    } catch (err) {
      console.error("Error saving managed sheet:", err);
    } finally {
      setIsSavingManage(false);
    }
  };

  // Soft-delete: move to trash (5-day recovery period)
  const handleDeleteSheet = async (id: string) => {
    if (!user) return;
    try {
      const now = new Date();
      const permanentDeleteAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const sheet = sheets.find((s) => s.id === id);
      const historyEntry = {
        action: "Owner moved sheet to Deleted Sheets",
        userId: user.uid,
        userName: user.displayName || "Owner",
        timestamp: Date.now(),
      };
      await updateDoc(doc(db, "measurementSheets", id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        permanentDeleteAt: Timestamp.fromDate(permanentDeleteAt),
        updatedAt: serverTimestamp(),
        history: [
          historyEntry,
          ...(sheet?.history || []),
        ],
      });
      setDeletingId(null);
    } catch (err) {
      console.error("Error soft-deleting measurement sheet:", err);
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
        dateISO: format(new Date(), "yyyy-MM-dd"),
        dateTimestamp: serverTimestamp(),
        personType: sheet.personType,
        sheetCategory: sheet.sheetCategory || (sheet.personType === "customer" ? "customer" : "polish"),
        locationType: sheet.locationType,
        sheetType: sheet.sheetType,
        numSlabs: sheet.numSlabs,
        people: JSON.parse(JSON.stringify(sheet.people)),
        participantIds: [user.uid],
        total: sheet.total || 0,
        favorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        autoDeleteAt: getAutoDeleteTimestamp(),
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

  const todayISO = format(new Date(), "yyyy-MM-dd");

  // Filter sheets by activeTypeParam (Worker vs Customer) — always exclude soft-deleted sheets
  const currentCategorySheets = sheets.filter((s) => {
    if (s.deleted) return false;
    if (!activeSheetCategory) return true;
    const sheetCategory = s.sheetCategory || (s.personType === "customer" ? "customer" : "polish");
    return sheetCategory === activeSheetCategory;
  });

  const getWorkerStatus = (sheet: MeasurementSheet) => {
    if (!user?.uid) return undefined;
    const pEntry = sheet.people?.find((p) => p.userId === user.uid);
    if (pEntry?.status) return pEntry.status;

    const iEntry = sheet.invitedWorkers?.find((p) => p.userId === user.uid);
    if (iEntry?.status) return iEntry.status;

    const polEntry = sheet.cuttingData?.polishes?.find((p) => p.userId === user.uid);
    if (polEntry?.status) return polEntry.status;

    return undefined;
  };

  // Separate: own vs pending vs accepted
  const mySheets = currentCategorySheets.filter((s) => s.userId === user?.uid);

  // Invitations — accept/decline notification only on the sheet's working day
  // (hidden for future-dated shares until that day arrives)
  const pendingSheets = currentCategorySheets.filter((s) => {
    if (s.userId === user?.uid) return false;
    const status = getWorkerStatus(s);
    if (status !== "pending") return false;
    const sheetDateISO = (s as any).dateISO || parseSheetDateISO(s.date);
    return sheetDateISO === todayISO;
  });

  const acceptedSharedSheets = currentCategorySheets.filter((s) => {
    if (s.userId === user?.uid) return false;
    const status = getWorkerStatus(s);
    if (status !== "accepted") return false;
    // For worker sheets, access is valid ONLY on that day
    if (s.personType === "worker") {
      const sheetDateISO = (s as any).dateISO || parseSheetDateISO(s.date);
      return sheetDateISO === todayISO;
    }
    return true;
  });

  // Displayed Sheets list
  const sheetsToDisplay = [...mySheets, ...acceptedSharedSheets];
  const filteredSheets = sheetsToDisplay
    .filter((s) => {
      if (locationTypeFilter !== "all" && s.locationType !== locationTypeFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchDate = s.date.toLowerCase().includes(q);
      const matchPeople = s.people.some((p) => p.name.toLowerCase().includes(q));
      return matchTitle || matchDate || matchPeople;
    })
    .sort((a, b) => {
      const getSheetDateISO = (s: MeasurementSheet): string => {
        if (s.dateISO) return s.dateISO;
        if (s.date) return parseSheetDateISO(s.date);
        return "0000-00-00";
      };

      const getSheetTimeMillis = (s: MeasurementSheet): number => {
        if ((s as any).createdAt?.toMillis) return (s as any).createdAt.toMillis();
        if ((s as any).createdAt?.seconds) return (s as any).createdAt.seconds * 1000;
        if (typeof (s as any).createdAt === "number") return (s as any).createdAt;
        return 0;
      };

      if (sortBy === "oldest") {
        const dateA = getSheetDateISO(a);
        const dateB = getSheetDateISO(b);
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB); // Oldest date first
        }
        return getSheetTimeMillis(a) - getSheetTimeMillis(b); // Oldest time first
      }

      if (sortBy === "modified") {
        const getMod = (s: any) => {
          if (s.updatedAt?.toMillis) return s.updatedAt.toMillis();
          if (s.updatedAt?.seconds) return s.updatedAt.seconds * 1000;
          return 0;
        };
        return getMod(b) - getMod(a);
      }

      // Default ("newest"): Date-wise descending (newest date first),
      // and for 2 or more sheets on the same date: time-wise descending (newest time first)
      const dateA = getSheetDateISO(a);
      const dateB = getSheetDateISO(b);
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA); // Newest date first
      }
      return getSheetTimeMillis(b) - getSheetTimeMillis(a); // Newest created time first
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

  const sectionLabel = activeSheetCategory === "polish" ? "Polish" : activeSheetCategory === "cutting" ? "Cutting" : "Customer";
  const sectionTitle = activeSheetCategory === "polish" ? "Polish Measurement Sheets" : activeSheetCategory === "cutting" ? "Cutting Measurement Sheets" : "Customer Measurement Sheets";
  const switchTarget = activeSheetCategory === "customer" ? "polish" : activeSheetCategory === "polish" ? "cutting" : "customer";
  const emptyStateLabel = activeSheetCategory === "polish" ? "polish" : activeSheetCategory === "cutting" ? "cutting" : "customer";

  // ── 1. SELECTION SCREEN (If type is null/not specified) ─────────────────────
  // Non-owners are locked to their assigned work type even if they change the URL.
  if (!activeTypeParam && user.accountType === "non-owner" && userWorkType) {
    router.replace(`/measurement-sheets?type=${userWorkType}`);
    return null;
  }

  if (
    activeTypeParam &&
    user.accountType === "non-owner" &&
    userWorkType &&
    activeTypeParam !== userWorkType
  ) {
    router.replace(`/measurement-sheets?type=${userWorkType}`);
    return null;
  }

  if (!activeTypeParam) {
    return (
      <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
        <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sheet-border bg-white/60 text-xs font-medium">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
              {user.displayName?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span>{user.displayName}</span>
          </div>
        </header>

        <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-sheet-text flex items-center justify-center gap-2 mb-2">
              <Ruler className="text-emerald-600" size={28} />
              Measurement Sheets
            </h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {user.accountType !== "non-owner" && (
              <button
                onClick={() => router.push("/measurement-sheets?type=customer")}
                className="group bg-sheet-surface border-2 border-sheet-border hover:border-blue-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:shadow-2xl transition-all duration-300 active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users size={32} />
                </div>
                <span className="text-xl font-bold text-sheet-text group-hover:text-blue-600">Customer</span>
                <div className="flex items-center gap-2 text-blue-600 font-semibold text-xs mt-2 group-hover:gap-3 transition-all">
                  <span>Select Customer Section</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            )}

            {(user.accountType !== "non-owner" || (user as any).workType === "polish") && (
              <button
                onClick={() => router.push("/measurement-sheets?type=polish")}
                className="group bg-sheet-surface border-2 border-sheet-border hover:border-emerald-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:shadow-2xl transition-all duration-300 active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <User size={32} />
                </div>
                <span className="text-xl font-bold text-sheet-text group-hover:text-emerald-600">Polish</span>
                <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs mt-2 group-hover:gap-3 transition-all">
                  <span>Select Polish Section</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            )}

            {(user.accountType !== "non-owner" || (user as any).workType === "cutting") && (
              <button
                onClick={() => router.push("/measurement-sheets?type=cutting")}
                className="group bg-sheet-surface border-2 border-sheet-border hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:shadow-2xl transition-all duration-300 active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Ruler size={32} />
                </div>
                <span className="text-xl font-bold text-sheet-text group-hover:text-indigo-600">Cutting</span>
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs mt-2 group-hover:gap-3 transition-all">
                  <span>Select Cutting Section</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── 2. DEDICATED SECTION (Customer, Polish or Cutting) ──────────────────────────────
  const isWorkerSection = activeSheetCategory === "polish" || activeSheetCategory === "cutting";

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
      <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-3 sm:px-6 justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              router.push(user.accountType === "non-owner" ? "/hub" : "/measurement-sheets")
            }
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
            title={user.accountType === "non-owner" ? "Back to Home" : "Back to Selection"}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="hidden sm:block">
            <AppSwitcher currentApp="measurement-sheets" />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user.accountType !== "non-owner" && (
            <button
              onClick={() => router.push(`/measurement-sheets?type=${switchTarget}`)}
              className="px-3 py-1.5 rounded-xl border border-sheet-border bg-white text-xs font-semibold text-sheet-text hover:bg-sheet-bg transition-colors"
            >
              Switch to {switchTarget === "customer" ? "Customer" : switchTarget === "polish" ? "Polish" : "Cutting"}
            </button>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-sheet-border bg-white/60 text-xs font-medium">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
              {user.displayName?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="hidden sm:inline">{user.displayName}</span>
          </div>

          {user.accountType !== "non-owner" && (
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 sm:gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all active:scale-95"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">New Measurement Sheet</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Title Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-sheet-text flex items-center gap-2">
              <Ruler className="text-emerald-600" size={20} />
              {sectionTitle}
            </h1>
          </div>
        </div>

        {/* ── PENDING REQUESTS ──────────────── */}
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
              {pendingSheets.map((s) => {
                return (
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-colors bg-emerald-600 text-white hover:bg-emerald-700"
                        title="Accept request"
                      >
                        <CheckCircle size={14} />
                        Accept
                      </button>
                    </div>
                  </div>
                );
              })}
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
            {!isWorkerSection && (
              <div className="flex items-center gap-1.5 bg-sheet-bg border border-sheet-border px-2.5 py-1.5 rounded-xl text-xs">
                <Filter size={13} className="text-sheet-muted" />
                <select value={locationTypeFilter} onChange={(e) => setLocationTypeFilter(e.target.value)} className="bg-transparent outline-none text-xs font-medium cursor-pointer">
                  <option value="all">All Locations</option>
                  <option value="local">Local Only</option>
                  <option value="national">National Only</option>
                </select>
              </div>
            )}
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
              {search || locationTypeFilter !== "all"
                ? "No measurement sheets match your search"
                : user.accountType === "non-owner"
                ? `No ${emptyStateLabel} measurement sheets assigned to you yet`
                : `No ${emptyStateLabel} measurement sheets created yet`}
            </p>
            {user.accountType !== "non-owner" && (
              <button
                onClick={() => { resetForm(); setShowCreateModal(true); }}
                className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                <Plus size={15} /><span>Create New Sheet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSheets.map((s) => {
              const isOwner = s.userId === user.uid;
              const myStatus = getWorkerStatus(s);
              const hasMultipleParticipants =
                s.sheetType === "multiple" &&
                (
                  s.people?.some((p) => p.status !== undefined) ||
                  s.invitedWorkers?.some((p) => p.status !== undefined) ||
                  s.cuttingData?.polishes?.some((p) => p.status !== undefined)
                );

              // Date check for worker sheet
              const sheetDateISO = (s as any).dateISO || parseSheetDateISO(s.date);
              const isWorkerValidToday = s.personType !== "worker" || isOwner || sheetDateISO === todayISO;

              // Use invite status from people / invitedWorkers / cutting polishes (not people-only).
              // Cutting sheets store invitees in invitedWorkers/polishes; people are machines.
              const canOpen = isOwner || (myStatus === "accepted" && isWorkerValidToday);

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

                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                      <Calendar size={13} />
                      <span>{s.date}</span>
                    </div>

                    {/* Total SQF Badge */}
                    <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200/60">
                      <Ruler size={13} className="text-emerald-600" />
                      <span className="text-[11px] font-bold text-emerald-700">
                        Total SQF: {calculateSheetTotal(s).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-xl border border-sheet-border/60">
                      <div className="flex items-center gap-1 font-medium text-[11px] text-slate-400 mb-1">
                        {s.sheetType === "private" ? <User size={12} /> : <Users size={12} />}
                        <span>
                          {activeSheetCategory === "cutting"
                            ? `Machines (${s.people.length})`
                            : s.people.length === 1
                            ? "Person:"
                            : `People (${s.people.length}):`}
                        </span>
                      </div>
                      <p className="truncate font-semibold text-slate-700">
                        {activeSheetCategory === "cutting"
                          ? s.people.map((p) => p.name).join(", ")
                          : s.people.map((p) => p.name).join(", ")}
                      </p>
                      {activeSheetCategory === "cutting" && getCuttingInvitees(s).length > 0 && (
                        <p className="mt-1.5 text-[11px] text-slate-500 truncate">
                          People: {getCuttingInvitees(s).map((p) => p.name).join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Participant Status */}
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

                  {/* Always-Visible Action Buttons (Requirement 1 & 2) */}
                  {isOwner && (
                    <div className="flex items-center gap-1.5 border-t border-sheet-border pt-3 mt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageSheet(s);
                          setManageTitle(s.title);
                          // Private sheet "name" is not an invited person — only show real invitees here
                          setManagePeople(
                            s.sheetCategory === "cutting"
                              ? getCuttingInvitees(s)
                              : s.sheetType === "private"
                              ? s.people.filter((p) => Boolean(p.userId))
                              : [...s.people]
                          );
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200/80 transition-all active:scale-95"
                        title="Manage Members & Permissions"
                      >
                        <Edit2 size={12} />
                        <span>Change</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateSheet(s);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all active:scale-95"
                        title="Copy Sheet"
                      >
                        <Copy size={12} />
                        <span>Copy</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(s.id);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs border border-red-200 transition-all active:scale-95"
                        title="Delete Sheet"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
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
                New {sectionLabel} Measurement Sheet
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted">
                <X size={18} />
              </button>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Date</label>
              <input
                type="text"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-slate-50 border border-sheet-border rounded-xl px-3 py-2 text-xs font-mono text-slate-700 outline-none"
              />
            </div>

            {activeSheetCategory === "cutting" && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Number of Machines <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formNumMachines ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setFormNumMachines(null);
                      return;
                    }
                    if (/^\d+$/.test(raw)) {
                      const parsed = Number(raw);
                      setFormNumMachines(parsed >= 1 ? parsed : null);
                    } else {
                      setFormNumMachines(null);
                    }
                  }}
                  className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            )}

            {/* Customer Specific Fields (Starting Slab Number, Measurement Type & Sheet Type) */}
            {!isWorkerSection && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Starting Slab Number <span className="text-slate-400 font-normal">(optional, default: 1)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 1, 50, 100…"
                    value={formNumSlabs}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || /^\d+$/.test(raw)) {
                        setFormNumSlabs(raw);
                      }
                    }}
                    className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Measurement Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setFormLocationType("local")}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${formLocationType === "local" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      Local
                    </button>
                    <button type="button" onClick={() => setFormLocationType("national")}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${formLocationType === "national" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      National
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Sheet Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setFormSheetType("private")}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${formSheetType === "private" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      Private
                    </button>
                    <button type="button" onClick={() => setFormSheetType("multiple")}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${formSheetType === "multiple" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/30" : "border-sheet-border hover:bg-sheet-bg text-slate-600"}`}>
                      Multiple
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Name Fields */}
            {effectiveSheetType === "private" && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Sheet Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter sheet name…"
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            )}

            {/* People / Person selector – for cutting this is optional */}
            {effectiveSheetType === "multiple" && (
              <div className="space-y-3">
                {activeSheetCategory === "cutting" && (
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <strong>Optional:</strong> Invite people who can accept and enter measurements for each machine.
                  </p>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {activeSheetCategory === "cutting" ? "Number of People to Invite (optional)" : `Number of ${isWorkerSection ? "Workers" : "People"}`}
                    {activeSheetCategory !== "cutting" && <span className="text-red-500"> *</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={numPeople}
                    onChange={(e) => handleNumPeopleChange(e.target.value)}
                    className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                  />
                </div>

                <div className="space-y-3 max-h-[min(28rem,55vh)] overflow-y-auto pr-1">
                  {selectedPeople.slice(0, typeof numPeople === "number" ? numPeople : 0).map((person, i) => (
                    <div key={i}>
                      <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                        {activeSheetCategory === "cutting" ? `Person ${i + 1} (optional)` : isWorkerSection ? `Polish ${i + 1}` : `Person ${i + 1}`}
                        {activeSheetCategory !== "cutting" && <span className="text-red-500"> *</span>}
                      </label>
                      <UserSelectDropdown
                        value={person.userId}
                        onChange={(userId, name) => handlePersonSelect(i, userId, name)}
                        excludeUserIds={getAlreadySelectedIds(i)}
                        placeholder={activeSheetCategory === "cutting" ? `Select Person ${i + 1} (optional)…` : isWorkerSection ? `Select Polish ${i + 1}...` : `Select Person ${i + 1}...`}
                      />
                    </div>
                  ))}
                </div>
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
            <div className="space-y-2">
              {(statusModalSheet.sheetCategory === "cutting"
                ? getCuttingInvitees(statusModalSheet)
                : statusModalSheet.people
              ).map((p, i) => (
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
              {statusModalSheet.sheetCategory === "cutting" && getCuttingInvitees(statusModalSheet).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">No people invited yet.</p>
              )}
            </div>
            <button onClick={() => setStatusModalSheet(null)} className="w-full px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── MANAGE SHEET & MEMBERS MODAL (Requirement 2) ────────────────── */}
      {manageSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-sheet-border pb-3 shrink-0">
              <h2 className="text-base font-bold text-sheet-text flex items-center gap-2">
                <Edit2 size={18} className="text-emerald-600" />
                Manage Sheet & Permissions
              </h2>
              <button onClick={() => setManageSheet(null)} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto flex-1 min-h-0 pr-0.5">
            {/* Sheet Title */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                {manageSheet.sheetType === "private" ? "Sheet Name" : "Sheet Title"}
              </label>
              <input
                type="text"
                value={manageTitle}
                onChange={(e) => setManageTitle(e.target.value)}
                className="w-full bg-sheet-bg border border-sheet-border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {manageSheet.sheetType === "private" && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  This is the sheet name only. Can Modify / View Only appears after you add people below.
                </p>
              )}
            </div>

            {/* Members & Permissions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-600">
                  {manageSheet?.sheetCategory === "cutting"
                    ? `People (${managePeople.length})`
                    : manageSheet?.sheetType === "private"
                    ? `People (${managePeople.length})`
                    : `Members / Polishes (${managePeople.length})`}
                </label>
                {manageSheet?.sheetCategory === "cutting" && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    Machines stay as tabs ({manageSheet.people?.length || 0})
                  </span>
                )}
              </div>

              {manageSheet?.sheetCategory === "cutting" && (
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  Can Modify / View Only applies to invited people only — not to machines.
                  People who open this sheet will see the same machine tabs.
                </p>
              )}

              {/* Add Member Dropdown */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 overflow-visible">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {manageSheet?.sheetCategory === "cutting" ? "+ Add Person" : "+ Add Member / Polish"}
                </label>
                <UserSelectDropdown
                  value={newMemberUserId}
                  onChange={(userId, name) => {
                    if (userId && name) {
                      const alreadyAdded = managePeople.some((p) => p.userId === userId || p.name === name);
                      if (!alreadyAdded) {
                        setManagePeople([
                          ...managePeople,
                          {
                            name,
                            userId,
                            status: "pending",
                            rows:
                              manageSheet?.sheetCategory === "cutting"
                                ? []
                                : EMPTY_ROWS.map((r, i) => ({
                                    rowNumber: i + 1,
                                    serialNumber: (manageSheet.startingSerialNumber || 1) + i,
                                    A: null,
                                    B: null,
                                    C: null,
                                    D: null,
                                    E: null,
                                    remark: "",
                                  })),
                            permissions: getDefaultPermissionsForDate(manageSheet?.dateISO || manageSheet?.date),
                          },
                        ]);
                      }
                      setNewMemberUserId("");
                    }
                  }}
                  excludeUserIds={[user?.uid || "", ...managePeople.map((p) => p.userId).filter((id): id is string => Boolean(id))]}
                  placeholder="Select person to add…"
                />
              </div>

              {/* Members List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {managePeople.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                    {manageSheet?.sheetCategory === "cutting"
                      ? "No people invited yet. Add someone above."
                      : manageSheet?.sheetType === "private"
                      ? "No people added yet. Add someone above to set Can Modify / View Only."
                      : "No members yet."}
                  </p>
                ) : (
                  managePeople.map((person, idx) => {
                    const canModify = Boolean(person.permissions?.canModifyMeasurements);
                    const isInvitedPerson = Boolean(person.userId);
                    const canRemove =
                      manageSheet?.sheetCategory === "cutting" ||
                      manageSheet?.sheetType === "private" ||
                      managePeople.length > 1;

                    return (
                      <div key={person.userId || idx} className="p-3 rounded-xl bg-white border border-sheet-border/80 shadow-sm flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                              {person.name[0]?.toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-slate-800 truncate">{person.name}</span>
                            {person.status && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${statusColor(person.status)}`}>
                                {statusLabel(person.status)}
                              </span>
                            )}
                          </div>

                          {/* Permission selector only for invited people */}
                          {isInvitedPerson && (
                            <div className="flex items-center gap-2 text-xs">
                              <label className="text-[11px] font-medium text-slate-500">Permission:</label>
                              <select
                                value={canModify ? "can_modify" : "view_only"}
                                onChange={(e) => {
                                  const isCanModify = e.target.value === "can_modify";
                                  const updated = [...managePeople];
                                  updated[idx] = {
                                    ...updated[idx],
                                    permissions: {
                                      canView: true,
                                      canModifyMeasurements: isCanModify,
                                      canModifySerialNumbers: false,
                                      canModifyRemarks: isCanModify,
                                      canAddRows: isCanModify,
                                      canDeleteRows: isCanModify,
                                    },
                                  };
                                  setManagePeople(updated);
                                }}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/30"
                              >
                                <option value="can_modify">Can Modify</option>
                                <option value="view_only">Cannot Modify / View Only</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => {
                              setManagePeople(managePeople.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                            title="Remove Member"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-sheet-border pt-4 shrink-0">
              <button
                type="button"
                onClick={() => setManageSheet(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingManage}
                onClick={handleSaveManageSheet}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-40 transition-all active:scale-95 flex items-center gap-1.5"
              >
                {isSavingManage ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE (SOFT) CONFIRMATION MODAL ─────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-sheet-surface border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-sheet-text mb-1">Move to Deleted Sheets?</h3>
                <p className="text-xs text-slate-500">
                  The sheet will move to <strong>Settings &gt; Account &gt; Deleted Sheets</strong> and stay recoverable for <strong>5 days</strong>. After that, it will be permanently deleted from the database.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border">Cancel</button>
              <button onClick={() => handleDeleteSheet(deletingId)} className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-sm">Move to Deleted</button>
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

export default function MeasurementSheetsDashboard() {
  return (
    <Suspense fallback={<LoadingGrid fullPage size="lg" label="Loading Measurement Workspace..." />}>
      <MeasurementDashboardContent />
    </Suspense>
  );
}
