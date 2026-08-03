"use client";

import { useAuthStore } from "@/lib/sync/authStore";

/**
 * Display-only nickname label shown in the editor header.
 * Editing is done via Settings → Account page.
 */
export function EditableNickname({ className }: { className?: string }) {
  const { user } = useAuthStore();
  const label = user?.nickname
    ? `@${user.nickname}`
    : user?.displayName ?? "";

  if (!label) return null;

  return (
    <span
      className={`text-xs font-medium text-sheet-muted ${className ?? ""}`}
      title={user?.nickname ? `Nickname: @${user.nickname}` : user?.displayName}
    >
      {label}
    </span>
  );
}