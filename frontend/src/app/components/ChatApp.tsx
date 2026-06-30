"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, sendChatMessage, RateLimitError, NetworkError, ServerError } from "@/lib/api";
import { checkHealth } from "@/lib/health";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

const STORAGE_KEY_MESSAGES = "chat-messages";
const STORAGE_KEY_THEME = "chat-theme";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const MAX_HISTORY_MESSAGES = 100;

export type Theme = "dark" | "light";

interface SystemMessage {
  type: "error" | "rate-limit" | "warning";
  content: string;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  });
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [systemMessage, setSystemMessage] = useState<SystemMessage | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  
  const hasMounted = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (hasMounted.current) {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    }
  }, [theme]);

  // Persist messages to localStorage with try/catch and limit to 100
  useEffect(() => {
    if (hasMounted.current) {
      try {
        const historyToSave = messages.slice(-MAX_HISTORY_MESSAGES);
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(historyToSave));
      } catch (error) {
        console.error("Failed to save messages to localStorage:", error);
      }
    }
  }, [messages]);

  // Mark mounted after first render effects
  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Health check polling
  useEffect(() => {
    if (!API_URL) return;

    const check = async () => {
      const healthy = await checkHealth(API_URL);
      setIsHealthy(healthy);
    };

    check();
    const interval = setInterval(check, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (rateLimitedUntil === null) return;

    cooldownTimerRef.current = setInterval(() => {
      if (Date.now() >= rateLimitedUntil) {
        setRateLimitedUntil(null);
        setSystemMessage(null);
        if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      } else {
        const remaining = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
        setSystemMessage({
          type: "rate-limit",
          content: `Rate limit reached. You can send another message in ${remaining}s.`,
        });
      }
    }, 1000);

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [rateLimitedUntil]);

  const executeSend = async (history: ChatMessage[], newSystemMessage: SystemMessage | null) => {
    setIsLoading(true);
    setSystemMessage(newSystemMessage);
    
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendChatMessage(history, API_URL, abortControllerRef.current.signal);
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: response.reply,
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMessage];
        return updated.slice(-MAX_HISTORY_MESSAGES);
      });
      
      // Clear error flag on the last user message if it was a retry
      setMessages((prev) => {
        const updated = [...prev];
        const lastUserIdx = updated.findLastIndex(m => m.role === "user");
        if (lastUserIdx !== -1) {
          updated[lastUserIdx] = { ...updated[lastUserIdx], isError: false };
        }
        return updated;
      });

    } catch (error) {
      if (abortControllerRef.current?.signal.aborted) {
        // Request was intentionally aborted (e.g. by Clear History)
        return;
      }

      // Mark the last user message as failed
      setMessages((prev) => {
        const updated = [...prev];
        const lastUserIdx = updated.findLastIndex(m => m.role === "user");
        if (lastUserIdx !== -1) {
          updated[lastUserIdx] = { ...updated[lastUserIdx], isError: true };
        }
        return updated;
      });

      if (error instanceof RateLimitError) {
        const until = Date.now() + error.retryAfterSeconds * 1000;
        setRateLimitedUntil(until);
        setSystemMessage({
          type: "rate-limit",
          content: `Rate limit reached. You can send another message in ${error.retryAfterSeconds}s.`,
        });
      } else if (error instanceof NetworkError || error instanceof ServerError) {
        setSystemMessage({ type: "error", content: error.message });
      } else {
        setSystemMessage({
          type: "error",
          content: "An unexpected error occurred. Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = useCallback(
    async (content: string) => {
      if (isLoading || rateLimitedUntil) return;

      const userMessage: ChatMessage = { id: generateId(), role: "user", content };
      const updatedMessages = [...messages, userMessage].slice(-MAX_HISTORY_MESSAGES);
      setMessages(updatedMessages);
      
      await executeSend(updatedMessages, null);
    },
    [messages, isLoading, rateLimitedUntil]
  );

  const handleRetry = useCallback(
    async (messageToRetry: ChatMessage) => {
      if (isLoading || rateLimitedUntil) return;
      
      // Clear the error flag instantly
      setMessages((prev) => prev.map(m => m.id === messageToRetry.id ? { ...m, isError: false } : m));
      
      // Send the history up to and including this message
      const msgIndex = messages.findIndex(m => m.id === messageToRetry.id);
      if (msgIndex === -1) return;
      
      const historyToResend = messages.slice(0, msgIndex + 1);
      await executeSend(historyToResend, null);
    },
    [messages, isLoading, rateLimitedUntil]
  );

  const handleClearHistory = useCallback(() => {
    // Abort pending request to prevent assistant message from appearing after clear
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setMessages([]);
    
    // Only clear system message if we are not rate limited
    if (!rateLimitedUntil) {
      setSystemMessage(null);
    }
    
    try {
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
    } catch (e) {
      console.error("Failed to clear localStorage", e);
    }
  }, [rateLimitedUntil]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const isMissingApiUrl = !API_URL;
  const inputDisabled = isLoading || rateLimitedUntil !== null || isMissingApiUrl;

  return (
    <div className="chat-app">
      <ChatHeader
        theme={theme}
        isHealthy={isHealthy}
        onToggleTheme={handleToggleTheme}
        onClearHistory={handleClearHistory}
      />
      <MessageList
        messages={messages}
        isLoading={isLoading}
        onRetry={handleRetry}
      />
      <div className="chat-input-area">
        {isMissingApiUrl && (
          <div className="system-message system-message--error" role="alert">
            ⚠️ API URL is not configured. Please set NEXT_PUBLIC_API_URL.
          </div>
        )}
        {systemMessage && !isMissingApiUrl && (
          <div className={`system-message system-message--${systemMessage.type}`} role="alert">
            {systemMessage.type === "error" ? "⚠️ " : "⏳ "}
            {systemMessage.content}
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={inputDisabled}
        />
      </div>
    </div>
  );
}
