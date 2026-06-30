import {
  sendChatMessage,
  RateLimitError,
  ServerError,
  NetworkError,
} from "@/lib/api";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("sendChatMessage", () => {
  const API_URL = "https://test-api.example.com";

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends correct request format with no session_id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Hi!", session_id: "abc-123", history_length_sent: 1 }),
    });

    await sendChatMessage("Hello", API_URL, null);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_URL}/api/chat`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_message: "Hello", session_id: null }),
      })
    );
  });

  it("sends session_id when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Hi again!", session_id: "abc-123", history_length_sent: 2 }),
    });

    await sendChatMessage("Follow up", API_URL, "abc-123");

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_URL}/api/chat`,
      expect.objectContaining({
        body: JSON.stringify({ new_message: "Follow up", session_id: "abc-123" }),
      })
    );
  });

  it("parses a successful response including session_id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Hello there!", session_id: "sess-456", history_length_sent: 1 }),
    });

    const result = await sendChatMessage("Hello", API_URL, null);

    expect(result.reply).toBe("Hello there!");
    expect(result.session_id).toBe("sess-456");
    expect(result.history_length_sent).toBe(1);
  });

  it("throws RateLimitError on 429 with Retry-After header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "15" }),
    });

    await expect(sendChatMessage("Hello", API_URL, null)).rejects.toThrow(
      RateLimitError
    );

    // Re-mock and test the retry-after value
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "15" }),
    });

    try {
      await sendChatMessage("Hello", API_URL, null);
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBe(15);
    }
  });

  it("throws RateLimitError with default 30s when no Retry-After header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    try {
      await sendChatMessage("Hello", API_URL, null);
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBe(30);
    }
  });

  it("throws ServerError on 503", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await expect(sendChatMessage("Hello", API_URL, null)).rejects.toThrow(
      ServerError
    );
  });

  it("throws ServerError on 500 with detail", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Ollama API error" }),
    });

    try {
      await sendChatMessage("Hello", API_URL, null);
    } catch (error) {
      expect(error).toBeInstanceOf(ServerError);
      expect((error as ServerError).message).toBe("Ollama API error");
      expect((error as ServerError).statusCode).toBe(500);
    }
  });

  it("throws NetworkError on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(sendChatMessage("Hello", API_URL, null)).rejects.toThrow(
      NetworkError
    );
  });

  it("throws NetworkError on abort (timeout)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    mockFetch.mockRejectedValueOnce(abortError);

    try {
      await sendChatMessage("Hello", API_URL, null);
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError);
      expect((error as NetworkError).message).toContain("timed out");
    }
  });
});
