"use client";

import { useRef, useEffect } from "react";
import { ChatMessage } from "@/lib/api";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onRetry?: (message: ChatMessage) => void;
}

export default function MessageList({ messages, isLoading, onRetry }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="message-list" role="log" aria-live="polite" aria-label="Chat messages">
      {messages.length === 0 && !isLoading && (
        <div className="message-list__empty">
          <div className="message-list__empty-icon">🤖</div>
          <p className="message-list__empty-title">Welcome to Pi Chat</p>
          <p className="message-list__empty-subtitle">
            Send a message to start a conversation.
          </p>
        </div>
      )}
      {messages.map((msg, index) => (
        <MessageBubble key={msg.id || index} message={msg} onRetry={onRetry} />
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
