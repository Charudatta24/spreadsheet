"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  MessageCircle,
  Users,
  UserPlus,
  Lock,
} from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import { useChat } from "@/hooks/useChat";
import {
  sendChatMessage,
  subscribeChatMessages,
} from "@/lib/firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

type Friend = {
  id: string;
  uid: string;     // real Firebase UID — used as DM targetUid
  name: string;
  email?: string;
  nickname?: string;
};

type ChatMessage = {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  color: string;
  timestamp: number;
};

// All chatbox DMs live under this Firestore document id.
// The targetUid filter in subscribeChatMessages makes each conversation private.
const CHATBOX_ROOM = "chatbox-dm";

// ── Chat overlay component ─────────────────────────────────────────────────

export function ChatBox({
  docId,
  isOpen,
  onClose,
  targetUid,
}: {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  targetUid?: string;
}) {
  const { user } = useAuthStore();
  const [input, setInput] = useState("");
  const { messages, sendMessage, reportTyping } = useChat(docId, isOpen, targetUid);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !user) return;
    await sendMessage(input.trim());
    setInput("");
  }, [input, sendMessage, user]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[min(100vw-2rem,360px)] max-w-[95vw] h-[min(100vh-2rem,430px)] max-h-[95vh] bg-white border border-sheet-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-sheet-border bg-sheet-bg">
        <div className="font-semibold text-sm">Chat</div>
        <button onClick={onClose} className="text-sheet-muted hover:text-sheet-accent">✕</button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 text-xs">
        {messages.length === 0 ? (
          <div className="text-center text-sheet-muted mt-10">No messages yet.</div>
        ) : (messages.map((m) => (
          <div key={m.id} className={`rounded-md p-2 ${m.uid === user?.uid ? "bg-sheet-accent/10 self-end" : "bg-sheet-bg/50"}`}>
            <div className="text-[11px] text-sheet-muted">{m.displayName}</div>
            <div className="text-sm text-sheet-text">{m.text}</div>
          </div>
        ))) }
      </div>
      <div className="border-t border-sheet-border p-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); reportTyping(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSend(); } }}
            className="flex-1 rounded-lg border border-sheet-border px-2 py-1 text-xs outline-none"
            placeholder="Type a message..."
          />
          <button
            onClick={() => void handleSend()}
            className="rounded-lg bg-sheet-accent text-white px-2 py-1 text-xs"
          >Send</button>
        </div>
      </div>
    </div>
  );
}

// ── Page (legacy) ───────────────────────────────────────────────────────────

export default function ChatboxPage() {
  const { user } = useAuthStore();

  // Friends from localStorage (populated by Hub settings)
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeFriendUid, setActiveFriendUid] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const friendKey = useMemo(() => `collabsheet-friends-${user?.uid}`, [user]);

  // ── Load friends ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(friendKey);
      if (raw) {
        const parsed: Friend[] = JSON.parse(raw);
        setFriends(parsed);
        // Auto-select first friend
        if (parsed.length > 0 && !activeFriendUid) {
          setActiveFriendUid(parsed[0].uid);
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, friendKey]);

  // ── Subscribe to DMs for active friend ────────────────────────────────────

  useEffect(() => {
    if (!user || !activeFriendUid) {
      setMessages([]);
      return;
    }

    // subscribeChatMessages with targetUid filters to only messages
    // exchanged between user.uid and activeFriendUid — fully private.
    const unsub = subscribeChatMessages(
      CHATBOX_ROOM,
      (newMsgs) => {
        // Keep up to 7 days of messages in the standalone chatbox
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setMessages(newMsgs.filter((m) => m.timestamp > cutoff));
      },
      activeFriendUid,
      user.uid,
    );

    return () => unsub();
  }, [user, activeFriendUid]);

  // ── Auto-scroll on new messages ────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Focus input when switching friend ─────────────────────────────────────

  useEffect(() => {
    if (activeFriendUid) setTimeout(() => inputRef.current?.focus(), 80);
  }, [activeFriendUid]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || !activeFriendUid || sending) return;

    setInput("");
    setSending(true);
    try {
      await sendChatMessage(
        CHATBOX_ROOM,
        user.uid,
        user.displayName,
        text,
        user.color,
        activeFriendUid,
      );
    } finally {
      setSending(false);
    }
  }, [input, user, activeFriendUid, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeFriend = friends.find((f) => f.uid === activeFriendUid) ?? null;

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen bg-sheet-bg flex items-center justify-center">
        <div className="text-sheet-muted text-sm">Loading…</div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-sheet-bg overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 border-b border-sheet-border bg-white flex items-center px-4 gap-3 z-10">
        <Link
          href="/hub"
          className="inline-flex items-center gap-1.5 text-sheet-muted hover:text-sheet-accent text-sm font-medium transition-colors"
        >
          <ArrowLeft size={15} />
          Hub
        </Link>
        <div className="w-px h-4 bg-sheet-border" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-sheet-accent/10 flex items-center justify-center">
            <MessageCircle size={14} className="text-sheet-accent" />
          </div>
          <span className="font-semibold text-sm text-sheet-text">Chatbox</span>
        </div>
        {activeFriend && (
          <>
            <div className="w-px h-4 bg-sheet-border" />
            <div className="flex items-center gap-1.5 text-xs text-sheet-muted">
              <Lock size={11} className="text-emerald-500" />
              <span>
                Private chat with{" "}
                <span className="font-semibold text-sheet-text">
                  {activeFriend.name}
                </span>
              </span>
            </div>
          </>
        )}
      </header>

      {/* ── Two-panel body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Friends sidebar ──────────────────────────────────────────── */}
        <aside className="w-64 lg:w-72 shrink-0 border-r border-sheet-border bg-white flex flex-col">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sheet-border">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-sheet-accent" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-sheet-muted">
                Friends
              </span>
            </div>
            <span className="text-[10px] text-sheet-muted bg-sheet-border px-2 py-0.5 rounded-full font-medium">
              {friends.length}
            </span>
          </div>

          {/* Friend list */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
                <div className="w-11 h-11 rounded-full bg-sheet-border/60 flex items-center justify-center mb-3">
                  <UserPlus size={18} className="text-sheet-muted" />
                </div>
                <p className="text-xs font-semibold text-sheet-text">No friends yet</p>
                <p className="text-[11px] text-sheet-muted mt-1 leading-relaxed">
                  Add friends from Hub → Settings to start chatting.
                </p>
                <Link
                  href="/hub#friends"
                  className="mt-3 text-xs text-sheet-accent hover:underline font-semibold"
                >
                  Go to Settings →
                </Link>
              </div>
            ) : (
              friends.map((f) => {
                const active = activeFriendUid === f.uid;
                return (
                  <button
                    key={f.uid}
                    onClick={() => setActiveFriendUid(f.uid)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all mb-1 ${active
                        ? "bg-sheet-accent/10 border border-sheet-accent/25 shadow-sm"
                        : "hover:bg-sheet-bg border border-transparent"
                      }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 transition-colors ${active ? "bg-sheet-accent" : "bg-sheet-muted/60"
                        }`}
                    >
                      {f.name[0]?.toUpperCase()}
                    </div>
                    {/* Name */}
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${active ? "text-sheet-accent" : "text-sheet-text"
                          }`}
                      >
                        {f.name}
                      </p>
                      {(f.nickname || f.email) && (
                        <p className="text-[11px] text-sheet-muted truncate">
                          {f.nickname ? `@${f.nickname}` : f.email}
                        </p>
                      )}
                    </div>
                    {/* Active dot */}
                    {active && (
                      <div className="w-1.5 h-1.5 rounded-full bg-sheet-accent shrink-0 ml-auto" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Chat panel ───────────────────────────────────────────────── */}
        <section className="flex-1 flex flex-col overflow-hidden bg-sheet-bg/40">

          {!activeFriend ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-sheet-accent/10 flex items-center justify-center mb-5">
                <MessageCircle size={32} className="text-sheet-accent" />
              </div>
              <h3 className="text-lg font-bold text-sheet-text mb-2">
                Select a friend to chat
              </h3>
              <p className="text-sm text-sheet-muted max-w-xs leading-relaxed">
                Choose someone from your friends list. Messages are private —
                only you and the other person can see them.
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="h-14 shrink-0 border-b border-sheet-border bg-white px-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-sheet-accent flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {activeFriend.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-sheet-text">
                      {activeFriend.name}
                    </p>
                    <p className="text-[11px] text-sheet-muted">
                      {activeFriend.nickname
                        ? `@${activeFriend.nickname}`
                        : activeFriend.email ?? "Friend"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full px-3 py-1 font-semibold">
                  <Lock size={10} />
                  Private · Only you two can see this
                </div>
              </div>

              {/* Messages area */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
                style={{ scrollbarWidth: "thin" }}
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-full bg-sheet-border/60 flex items-center justify-center mb-3">
                      <MessageCircle size={20} className="text-sheet-muted" />
                    </div>
                    <p className="text-sm font-semibold text-sheet-text">
                      No messages yet
                    </p>
                    <p className="text-xs text-sheet-muted mt-1">
                      Say hello to {activeFriend.name}!
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.uid === user.uid;
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                      >
                        {/* Avatar (other person only) */}
                        {!isMe && (
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                            style={{ background: msg.color || "#6b7280" }}
                          >
                            {msg.displayName[0]?.toUpperCase()}
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                          {!isMe && (
                            <span className="text-[10px] text-sheet-muted mb-1 ml-1">
                              {msg.displayName}
                            </span>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isMe
                                ? "bg-sheet-accent text-white rounded-br-sm"
                                : "bg-white text-sheet-text border border-sheet-border rounded-bl-sm"
                              }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                            <p
                              className={`text-[10px] mt-1 ${isMe ? "text-white/60 text-right" : "text-sheet-muted"
                                }`}
                            >
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input bar */}
              <div className="shrink-0 p-4 bg-white border-t border-sheet-border">
                <div className="flex items-center gap-3 bg-sheet-bg rounded-2xl px-4 py-2.5 border border-sheet-border focus-within:border-sheet-accent/60 focus-within:ring-2 focus-within:ring-sheet-accent/15 transition-all">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${activeFriend.name}…`}
                    className="flex-1 bg-transparent py-1 text-sm outline-none text-sheet-text placeholder:text-sheet-muted"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className={`p-2 rounded-xl transition-all active:scale-90 ${input.trim() && !sending
                        ? "bg-sheet-accent text-white hover:bg-sheet-accent-dim shadow-sm"
                        : "text-sheet-muted cursor-not-allowed"
                      }`}
                  >
                    <Send size={16} />
                  </button>
                </div>
                <p className="text-center text-[10px] text-sheet-muted/60 mt-2 font-medium">
                  🔒 Private · Only visible to you and {activeFriend.name}
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}