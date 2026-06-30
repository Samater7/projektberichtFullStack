"use client";

import { Theme } from "./ChatApp";
import ThemeToggle from "./ThemeToggle";

interface ChatHeaderProps {
  theme: Theme;
  isHealthy: boolean | null;
  onToggleTheme: () => void;
  onClearHistory: () => void;
}

export default function ChatHeader({
  theme,
  isHealthy,
  onToggleTheme,
  onClearHistory,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-header__left">
        <h1 className="chat-header__title">Pi Chat</h1>
        <div
          className={`health-dot ${
            isHealthy === null
              ? "health-dot--unknown"
              : isHealthy
              ? "health-dot--healthy"
              : "health-dot--unhealthy"
          }`}
          title={
            isHealthy === null
              ? "Checking connection..."
              : isHealthy
              ? "Server is online"
              : "Server is offline"
          }
          aria-label={
            isHealthy === null
              ? "Checking connection"
              : isHealthy
              ? "Server is online"
              : "Server is offline"
          }
        />
      </div>
      <div className="chat-header__right">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button
          id="clear-history-btn"
          className="btn btn--ghost"
          onClick={onClearHistory}
          title="Clear conversation"
          aria-label="Clear conversation history"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
