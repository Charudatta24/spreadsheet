"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDocumentMeta } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";
import { useEditorStore } from "@/lib/sync/store";
import { useDocumentSync } from "@/hooks/useDocumentSync";
import { usePresence } from "@/hooks/usePresence";
import { EditorHeader } from "@/components/grid/EditorHeader";
import { SpreadsheetGrid } from "@/components/grid/SpreadsheetGrid";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { FormulaBar } from "@/components/grid/FormulaBar";
import { ChatBox } from "@/components/chat/ChatBox";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { useChat, useDmNotifications } from "@/hooks/useChat";

function EditorInner({ docId }: { docId: string }) {
  const router = useRouter();
  const [deleted, setDeleted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<string | undefined>(undefined);

  const { unreadCount: activeUnreadCount } = useChat(docId, chatOpen, chatTarget);
  const { unreadCount: groupUnreadCount } = useChat(docId, chatOpen && !chatTarget, undefined);
  const { unreadUids: unreadDmUids } = useDmNotifications(docId);

  const handleDeleted = useCallback(() => {
    setDeleted(true);
    setTimeout(() => router.push("/dashboard"), 3000);
  }, [router]);

  useDocumentSync(docId, handleDeleted);
  usePresence(docId);
  const { loadDocument } = useEditorStore();

  useEffect(() => {
    getDocumentMeta(docId).then((meta) => {
      if (meta) loadDocument({ id: meta.id, title: meta.title, ownerId: meta.ownerId });
    });
  }, [docId, loadDocument]);

  if (deleted) {
    return (
      <div className="flex items-center justify-center h-screen bg-sheet-bg">
        <div className="text-center">
          <div className="text-4xl mb-4">🗑️</div>
          <p className="text-sm font-medium text-sheet-text mb-1">This spreadsheet was deleted.</p>
          <p className="text-xs text-sheet-muted">Redirecting you to the dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-sheet-bg relative">
      <EditorHeader
        docId={docId}
        onToggleChat={() => {
          setChatTarget(undefined);
          setChatOpen(!chatOpen);
        }}
        unreadCount={groupUnreadCount}
        onSelectTarget={(uid) => {
          setChatTarget(uid ?? undefined);
          setChatOpen(true);
        }}
        unreadDmUids={unreadDmUids}
      />
      <Toolbar />
      <FormulaBar />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid />
      </div>
      <ChatBox 
        docId={docId} 
        isOpen={chatOpen} 
        onClose={() => setChatOpen(false)} 
        targetUid={chatTarget}
      />
    </div>
  );
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const docId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!docId || !user) return;
    getDocumentMeta(docId).then((meta) => {
      if (!meta) {
        setValid(false);
        return;
      }
      const hasAccess = meta.acceptedUsers?.includes(user.uid) || meta.ownerId === user.uid;
      if (!hasAccess) {
        setAccessDenied(true);
      } else {
        setValid(true);
      }
    });
  }, [docId, user]);

  if (!docId || valid === false) {
    return (
      <div className="flex items-center justify-center h-screen text-sheet-muted">
        <div className="text-center">
          <p className="text-sm">Document not found.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-2 text-sheet-accent text-sm hover:underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center h-screen text-sheet-muted">
        <div className="text-center">
          <p className="text-sm">Access Denied.</p>
          <p className="text-xs mt-1">You must accept the invitation from your dashboard to view this document.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 text-sheet-accent text-sm hover:underline"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (valid === null) {
    return <LoadingGrid fullPage size="lg" label="Opening spreadsheet..." />;
  }

  return (
    <div className="reveal-content h-full w-full">
      <EditorInner docId={docId} />
    </div>
  );
}
