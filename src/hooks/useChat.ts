"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/lib/sync/authStore";
import { sendChatMessage, subscribeChatMessages, subscribeDmSignals, setDmUnreadStatus } from "@/lib/firebase/firestore";
import { updateTypingStatus } from "@/lib/firebase/presence";
import { useEditorStore } from "@/lib/sync/store";

export type ChatMessage = {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  color: string;
  timestamp: number;
};

const TYPING_TIMEOUT = 3000;

// Module-level cache to track seen message IDs across remounts/refreshes
const globalSeenCache: Record<string, string> = {};

export function useChat(docId: string, isOpen: boolean, targetUid?: string) {
  const { user } = useAuthStore();
  const { presenceUsers } = useEditorStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const cacheKey = `${docId}_${targetUid || "group"}`;

  useEffect(() => {
    if (!docId) return;

    const unsub = subscribeChatMessages(docId, (newMessages) => {
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      const validMessages = newMessages.filter(m => now - m.timestamp < oneHour);
      
      setMessages(validMessages);

      if (validMessages.length > 0) {
        const lastMsg = validMessages[validMessages.length - 1];
        
        if (!isOpen) {
          const cachedId = globalSeenCache[cacheKey];
          if (lastMsg.uid !== user?.uid && lastMsg.id !== cachedId) {
            // Only increment if we have a previous baseline for this session/group
            if (cachedId) {
              setUnreadCount(prev => prev + 1);
            }
          }
        } else {
          setUnreadCount(0);
          if (user && targetUid) {
            setDmUnreadStatus(docId, targetUid, user.uid, false);
          }
        }
        globalSeenCache[cacheKey] = lastMsg.id;
      }
    }, targetUid, user?.uid);

    return () => unsub();
  }, [docId, isOpen, user?.uid, targetUid]);

  // Also clear when isOpen changes to true or new messages arrive while open
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      if (user && targetUid) {
        setDmUnreadStatus(docId, targetUid, user.uid, false);
      }
    }
  }, [isOpen, messages, docId, user, targetUid]);

  const sendMessage = useCallback(async (text: string) => {
    if (!user || !text.trim()) return;
    await sendChatMessage(docId, user.uid, user.displayName, text.trim(), user.color, targetUid);
    // Immediately stop typing
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    updateTypingStatus(docId, user.uid, null);
  }, [docId, user, targetUid]);

  const reportTyping = useCallback(() => {
    if (!user) return;
    const target = targetUid || "group";
    updateTypingStatus(docId, user.uid, target);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      updateTypingStatus(docId, user.uid, null);
    }, TYPING_TIMEOUT);
  }, [docId, user, targetUid]);

  const typingUsers = presenceUsers.filter(u => 
    u.uid !== user?.uid && 
    u.typingTarget === (targetUid || "group")
  );

  return {
    messages,
    sendMessage,
    reportTyping,
    unreadCount,
    typingUsers,
  };
}

export function useDmNotifications(docId: string) {
  const { user } = useAuthStore();
  const [unreadUids, setUnreadUids] = useState<string[]>([]);

  useEffect(() => {
    if (!docId || !user) return;
    const unsub = subscribeDmSignals(docId, user.uid, setUnreadUids);
    return () => unsub();
  }, [docId, user]);

  return { unreadUids };
}
