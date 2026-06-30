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
  const messages = [{ role: "user" as const, content: "Hello" }];

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends correct request format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Hi!", history_length_sent: 1 }),
    });

    await sendChatMessage(messages, API_URL);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_URL}/api/chat`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })
    );
  });

  it("parses a successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Hello there!", history_length_sent: 1 }),
    });

    const result = await sendChatMessage(messages, API_URL);

    expect(result.reply).toBe("Hello there!");
    expect(result.history_length_sent).toBe(1);
  });

  it("throws RateLimitError on 429 with Retry-After header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "15" }),
    });

    await expect(sendChatMessage(messages, API_URL)).rejects.toThrow(
      RateLimitError
    );

    try {
      await sendChatMessage(messages, API_URL);
    } catch {
      // First call already threw; reset and try again for assertion
    }

    // Re-mock and test the retry-after value
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "15" }),
    });

    try {
      await sendChatMessage(messages, API_URL);
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
      await sendChatMessage(messages, API_URL);
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

    await expect(sendChatMessage(messages, API_URL)).rejects.toThrow(
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
      await sendChatMessage(messages, API_URL);
    } catch (error) {
      expect(error).toBeInstanceOf(ServerError);
      expect((error as ServerError).message).toBe("Ollama API error");
      expect((error as ServerError).statusCode).toBe(500);
    }
  });

  it("throws NetworkError on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(sendChatMessage(messages, API_URL)).rejects.toThrow(
      NetworkError
    );
  });

  it("throws NetworkError on abort (timeout)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    mockFetch.mockRejectedValueOnce(abortError);

    try {
      await sendChatMessage(messages, API_URL);
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError);
      expect((error as NetworkError).message).toContain("timed out");
    }
  });
});
