"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDocumentMeta } from "@/lib/firebase/firestore";
import { useEditorStore } from "@/lib/sync/store";
import { useDocumentSync } from "@/hooks/useDocumentSync";
import { usePresence } from "@/hooks/usePresence";
import { EditorHeader } from "@/components/grid/EditorHeader";
import { SpreadsheetGrid } from "@/components/grid/SpreadsheetGrid";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { FormulaBar } from "@/components/grid/FormulaBar";

function EditorInner({ docId }: { docId: string }) {
  useDocumentSync(docId);
  usePresence(docId);
  const { loadDocument } = useEditorStore();

  useEffect(() => {
    getDocumentMeta(docId).then((meta) => {
      if (meta) loadDocument({ id: meta.id, title: meta.title });
    });
  }, [docId, loadDocument]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-sheet-bg">
      <EditorHeader docId={docId} />
      <Toolbar />
      <FormulaBar />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid />
      </div>
    </div>
  );
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!docId) return;
    getDocumentMeta(docId).then((meta) => {
      setValid(!!meta);
    });
  }, [docId]);

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

  if (valid === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-5 h-5 border-2 border-sheet-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <EditorInner docId={docId} />;
}
