"use client";

export default function TypingIndicator() {
  return (
    <div className="message-bubble-wrapper message-bubble-wrapper--assistant">
      <div className="message-bubble message-bubble--assistant typing-indicator" aria-label="Assistant is typing">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
