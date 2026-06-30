export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export interface ChatResponse {
  reply: string;
  session_id: string;
  history_length_sent: number;
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ServerError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ServerError";
    this.statusCode = statusCode;
  }
}

export class NetworkError extends Error {
  constructor(message: string = "Could not reach the server. Please try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

export async function sendChatMessage(
  message: string,
  apiUrl: string,
  sessionId: string | null,
  externalSignal?: AbortSignal
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (externalSignal) {
    externalSignal.addEventListener("abort", () => {
      controller.abort();
    });
    if (externalSignal.aborted) {
      controller.abort();
    }
  }

  try {
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_message: message, session_id: sessionId }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 30;
      throw new RateLimitError(isNaN(seconds) ? 30 : seconds);
    }

    if (response.status === 503) {
      throw new ServerError(503, "The LLM server is not reachable. Please try again later.");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ServerError(
        response.status,
        (errorData as { detail?: string }).detail || "An unexpected server error occurred."
      );
    }

    const data: ChatResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ServerError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError("Request timed out. The server took too long to respond.");
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeoutId);
  }
}
