"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, MessageCircle, MoreHorizontal } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useAuthStore } from "@/lib/sync/authStore";
import { useEditorStore } from "@/lib/sync/store";

export function ChatBox({ 
  docId, 
  isOpen, 
  onClose,
  targetUid
}: { 
  docId: string; 
  isOpen: boolean; 
  onClose: () => void;
  targetUid?: string;
}) {
  const { user } = useAuthStore();
  const { title, presenceUsers } = useEditorStore();
  const { messages, sendMessage, reportTyping, typingUsers } = useChat(docId, isOpen, targetUid);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetUser = presenceUsers.find(u => u.uid === targetUid);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  // Auto-hide logic
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    // Use capture phase to ensure we catch clicks even if they are stopped later
    // Add listener after a small delay to avoid closing immediately on the click that opens it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, { capture: true });
      document.addEventListener("click", handleClickOutside, { capture: true });
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside, { capture: true });
      document.removeEventListener("click", handleClickOutside, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend();
    } else {
      reportTyping();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed bottom-6 right-6 w-80 h-[480px] flex flex-col z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      {/* Spreadsheet-Matched Minimalist Container */}
      <div className="flex flex-col h-full rounded-2xl overflow-hidden border border-sheet-border shadow-2xl bg-white">
        
        {/* Clean Header */}
        <div className="bg-sheet-header border-b border-sheet-border p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sheet-accent/10 flex items-center justify-center">
              <MessageCircle size={18} className="text-sheet-accent" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-sheet-text truncate">
                {targetUser 
                  ? `Chat with ${targetUser.nickname || targetUser.displayName}` 
                  : `${title || "Untitled Spreadsheet"} Chat`}
              </h3>
              <p className="text-[10px] text-sheet-muted">
                {targetUser ? "Private Message" : "Online Collaboration"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="hover:bg-sheet-border p-1.5 rounded-lg transition-colors text-sheet-muted active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages with Light Aesthetic */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-sheet-bg/30"
        >
          {messages.map((msg) => {
            const isMe = msg.uid === user?.uid;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] font-medium ml-1 mb-1 text-sheet-muted">
                    {msg.displayName}
                  </span>
                )}
                <div 
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                    isMe 
                      ? "bg-sheet-accent text-white rounded-tr-none" 
                      : "bg-white text-sheet-text rounded-tl-none border border-sheet-border"
                  }`}
                >
                  <p className="leading-tight">{msg.text}</p>
                  <div className={`text-[9px] mt-1 text-right ${isMe ? "text-white/70" : "text-sheet-muted"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex flex-col items-start animate-in fade-in slide-in-from-left-2">
              <span className="text-[10px] font-medium ml-1 mb-1 text-sheet-muted">
                {typingUsers[0].nickname || typingUsers[0].displayName} is typing
              </span>
              <div className="bg-white border border-sheet-border rounded-xl px-3 py-2 flex items-center gap-1">
                <div className="w-1 h-1 bg-sheet-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1 h-1 bg-sheet-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1 h-1 bg-sheet-muted rounded-full animate-bounce" />
              </div>
            </div>
          )}

          {messages.length === 0 && typingUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-30 select-none">
              <MoreHorizontal size={32} className="text-sheet-muted mb-2" />
              <p className="text-xs font-medium text-sheet-muted">No recent messages</p>
            </div>
          )}
        </div>

        {/* Minimal Input Area */}
        <div className="p-3 bg-white border-t border-sheet-border">
          <div className="flex items-center gap-2 bg-sheet-bg rounded-xl p-1 px-2 border border-sheet-border focus-within:border-sheet-accent/50 focus-within:ring-1 focus-within:ring-sheet-accent/20 transition-all">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="flex-1 bg-transparent py-2 text-sm outline-none border-none placeholder:text-sheet-muted text-sheet-text"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                input.trim() 
                  ? "text-sheet-accent hover:bg-sheet-accent/10" 
                  : "text-sheet-muted"
              }`}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-[9px] text-center text-sheet-muted mt-2 font-medium">
            Messages disappear after 1 hour
          </p>
        </div>
      </div>
    </div>
  );
}
