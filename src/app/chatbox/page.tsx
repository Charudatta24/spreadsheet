"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send, MessageCircle, Users, UserPlus } from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import { subscribeFriends, type FriendEntry } from "@/lib/firebase/friends";
import { sendChatMessage, subscribeChatMessages } from "@/lib/firebase/firestore";

type ChatMessage = {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  timestamp: number;
};

const GLOBAL_CHAT_DOC = "global-chat";

export default function ChatboxPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const friendIdFromQuery = searchParams.get("friendId");

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeFriends(user.uid, setFriends);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || !activeFriendId) return;
    const unsub = subscribeChatMessages(
      GLOBAL_CHAT_DOC,
      (newMessages) => {
        setMessages((prev) => ({
          ...prev,
          [activeFriendId]: newMessages as ChatMessage[],
        }));
      },
      activeFriendId,
      user.uid
    );
    return () => unsub();
  }, [user, activeFriendId]);

  useEffect(() => {
    if (friends.length === 0) return;
    if (friendIdFromQuery && friends.some((f) => f.uid === friendIdFromQuery)) {
      setActiveFriendId(friendIdFromQuery);
      return;
    }
    if (!activeFriendId) {
      setActiveFriendId(friends[0].uid);
    }
  }, [friends, friendIdFromQuery, activeFriendId]);

  if (!user) {
    return (
      <div className="min-h-screen bg-sheet-bg text-sheet-text flex items-center justify-center">
        <div className="text-sheet-muted">Loading...</div>
      </div>
    );
  }

  const activeFriend = friends.find((f) => f.uid === activeFriendId) ?? null;
  const activeMessages = activeFriendId ? messages[activeFriendId] ?? [] : [];

  const sendMessage = async () => {
    if (!user || !activeFriendId || !messageText.trim()) return;
    await sendChatMessage(
      GLOBAL_CHAT_DOC,
      user.uid,
      user.displayName || "You",
      messageText.trim(),
      "#0f172a",
      activeFriendId
    );
    setMessageText("");
  };

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text reveal-content p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-sheet-bg/80 border border-sheet-border rounded-2xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-sheet-border px-4 py-3 bg-sheet-bg/90">
          <div className="flex items-center gap-2 text-sheet-muted">
            <Link href="/hub" className="inline-flex items-center gap-1 hover:text-sheet-accent">
              <ArrowLeft size={16} /> Hub
            </Link>
            <span className="text-xs uppercase tracking-[0.2em]">Chatbox</span>
          </div>
          <div className="text-sm font-semibold text-sheet-white flex items-center gap-2"><MessageCircle size={16} /> Live Chat</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[70vh]">
          <div className="border-r border-sheet-border bg-sheet-bg/50 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase text-sheet-accent font-semibold">Friends</div>
              <span className="text-xs text-sheet-muted">{friends.length} connected</span>
            </div>
            {friends.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sheet-border p-3 text-xs text-sheet-muted">
                Invite friends from settings to start one-on-one chat.
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <button
                    key={friend.uid}
                    onClick={() => setActiveFriendId(friend.uid)}
                    className={`w-full text-left rounded-lg p-2 border ${activeFriendId === friend.uid ? "border-sheet-accent bg-sheet-accent/10" : "border-sheet-border bg-sheet-bg/80 hover:border-sheet-accent/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{friend.name}</div>
                      <div className="text-[11px] text-sheet-accent"><Users size={12} className="inline-block" /> Chat</div>
                    </div>
                    {friend.email && <div className="text-[11px] text-sheet-muted">{friend.email}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 flex flex-col">
            {!activeFriend ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-sheet-border bg-sheet-bg/30 p-6 text-center">
                <div className="mb-2 text-sheet-accent"><UserPlus size={18} /></div>
                <div className="text-lg font-semibold">Select a friend to chat</div>
                <p className="mt-2 text-sm text-sheet-muted">Go to settings to add or accept friend requests first.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-sheet-border pb-2 mb-2">
                  <div>
                    <div className="text-lg font-semibold">{activeFriend.name}</div>
                    <div className="text-xs text-sheet-muted">Private chat only between you and {activeFriend.name}</div>
                  </div>
                  <div className="text-xs text-sheet-accent">Secure</div>
                </div>

                <div className="flex-1 overflow-y-auto px-1 space-y-2">
                  {activeMessages.length === 0 ? (
                    <div className="py-10 text-center text-sheet-muted text-sm">No messages yet. Start the conversation.</div>
                  ) : (
                    activeMessages.map((msg) => (
                      <div key={msg.id} className={`rounded-xl p-2 ${msg.displayName === user.displayName ? "bg-sheet-accent/20 self-end" : "bg-sheet-bg/70"}`}>
                        <div className="text-xs text-sheet-muted">{msg.displayName}</div>
                        <div className="text-sm">{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-sheet-border">
                  <div className="flex gap-2">
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                      placeholder={`Message ${activeFriend.name}...`}
                      className="flex-1 rounded-lg border border-sheet-border bg-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sheet-accent"
                    />
                    <button
                      onClick={sendMessage}
                      className="rounded-lg bg-sheet-accent px-3 py-2 text-white hover:bg-sheet-accent-dim"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
