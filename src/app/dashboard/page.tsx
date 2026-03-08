"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Plus, FileSpreadsheet, Trash2, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { listDocuments, createDocument, deleteDocument } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";
import type { DocumentMeta } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    listDocuments(user.uid)
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleCreate() {
    if (!user) return;
    setCreating(true);
    try {
      const doc = await createDocument(user.uid, user.displayName);
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
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  async function handleSignOut() {
    await signOut(auth);
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text">
      {/* Header */}
      <header className="border-b border-sheet-border bg-sheet-surface">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4f6ef7" />
              <rect x="8" y="8" width="7" height="7" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="17" y="8" width="7" height="7" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="8" y="17" width="7" height="7" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="17" y="17" width="7" height="7" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
            <span className="font-semibold text-sm">CollabSheet</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-sheet-muted">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: user?.color }}
              >
                {user?.displayName?.[0]?.toUpperCase()}
              </div>
              <span>{user?.displayName}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-sheet-muted hover:text-sheet-text transition-colors px-2 py-1 rounded hover:bg-sheet-border"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Your spreadsheets</h1>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-sheet-accent hover:bg-sheet-accent-dim text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            {creating ? "Creating…" : "New spreadsheet"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sheet-muted">
            <div className="w-5 h-5 border-2 border-sheet-accent border-t-transparent rounded-full animate-spin mr-2" />
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
            <FileSpreadsheet size={40} className="mx-auto mb-3 text-sheet-border" />
            <p className="text-sheet-muted text-sm">No spreadsheets yet.</p>
            <button
              onClick={handleCreate}
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
                onClick={() => router.push(`/editor/${doc.id}`)}
                onDelete={(e) => handleDelete(doc.id, e)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DocCard({
  doc,
  onClick,
  onDelete,
}: {
  doc: DocumentMeta;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-sheet-surface border border-sheet-border rounded-xl p-4 cursor-pointer hover:border-sheet-accent transition-all hover:bg-sheet-surface/80"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 bg-sheet-accent/10 rounded-lg flex items-center justify-center">
          <FileSpreadsheet size={16} className="text-sheet-accent" />
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-sheet-muted hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <h3 className="font-medium text-sm text-sheet-text truncate mb-1">
        {doc.title}
      </h3>
      <p className="text-xs text-sheet-muted">
        {doc.ownerName} · {formatDistanceToNow(doc.updatedAt, { addSuffix: true })}
      </p>
    </div>
  );
}
