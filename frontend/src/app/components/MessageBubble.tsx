"use client";

import { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

export default function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.isError;

  return (
    <div className={`message-bubble-wrapper message-bubble-wrapper--${message.role}`}>
      <div
        className={`message-bubble message-bubble--${message.role} ${
          isError ? "message-bubble--error" : ""
        }`}
        aria-label={`${isUser ? "You" : "Assistant"} said`}
      >
        <p className="message-bubble__content">{message.content}</p>
        {isError && (
          <div className="message-bubble__error-actions">
            <span className="message-bubble__error-text">Failed to send</span>
            {onRetry && (
              <button
                className="btn btn--ghost btn--small message-bubble__retry-btn"
                onClick={() => onRetry(message)}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
