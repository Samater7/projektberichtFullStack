import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatApp from "@/app/components/ChatApp";

// Mock the API module
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    sendChatMessage: jest.fn(),
  };
});

// Mock the health module
jest.mock("@/lib/health", () => ({
  checkHealth: jest.fn().mockResolvedValue(true),
}));

import { sendChatMessage, RateLimitError, NetworkError, ServerError } from "@/lib/api";

const mockSendChatMessage = sendChatMessage as jest.MockedFunction<
  typeof sendChatMessage
>;

describe("ChatApp", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSendChatMessage.mockReset();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders with empty state", () => {
    render(<ChatApp />);
    expect(screen.getByText("Welcome to Pi Chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Message input")).toBeEnabled();
  });

  it("sends a message and displays the reply", async () => {
    const user = userEvent.setup();

    mockSendChatMessage.mockResolvedValueOnce({
      reply: "Hello! I am an AI.",
      history_length_sent: 1,
    });

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Hello");
    await user.click(screen.getByLabelText("Send message"));

    // User message should appear
    expect(screen.getByText("Hello")).toBeInTheDocument();

    // Wait for assistant reply
    await waitFor(() => {
      expect(screen.getByText("Hello! I am an AI.")).toBeInTheDocument();
    });
  });

  it("persists messages to localStorage", async () => {
    const user = userEvent.setup();

    mockSendChatMessage.mockResolvedValueOnce({
      reply: "Stored reply",
      history_length_sent: 1,
    });

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Persist me");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Stored reply")).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem("chat-messages") || "[]");
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual(expect.objectContaining({ role: "user", content: "Persist me" }));
    expect(stored[1]).toEqual(expect.objectContaining({ role: "assistant", content: "Stored reply" }));
  });

  it("loads messages from localStorage on mount", () => {
    const savedMessages = [
      { role: "user", content: "Previous question" },
      { role: "assistant", content: "Previous answer" },
    ];
    localStorage.setItem("chat-messages", JSON.stringify(savedMessages));

    render(<ChatApp />);

    expect(screen.getByText("Previous question")).toBeInTheDocument();
    expect(screen.getByText("Previous answer")).toBeInTheDocument();
  });

  it("clears history when clear button is clicked", async () => {
    const user = userEvent.setup();

    const savedMessages = [
      { role: "user", content: "To be cleared" },
      { role: "assistant", content: "Also cleared" },
    ];
    localStorage.setItem("chat-messages", JSON.stringify(savedMessages));

    render(<ChatApp />);

    expect(screen.getByText("To be cleared")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Clear conversation history"));

    expect(screen.queryByText("To be cleared")).not.toBeInTheDocument();
    expect(screen.queryByText("Also cleared")).not.toBeInTheDocument();
    expect(localStorage.getItem("chat-messages")).toBe("[]");
  });

  it("shows rate limit message on 429 response", async () => {
    const user = userEvent.setup();

    mockSendChatMessage.mockRejectedValueOnce(new RateLimitError(30));

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Rate limited");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("Rate limit");
    });
  });

  it("shows error message on network error", async () => {
    const user = userEvent.setup();

    mockSendChatMessage.mockRejectedValueOnce(
      new NetworkError("Could not reach the server. Please try again.")
    );

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Network fail");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not reach the server"
      );
    });
  });

  it("shows error message on server error (503)", async () => {
    const user = userEvent.setup();

    mockSendChatMessage.mockRejectedValueOnce(
      new ServerError(503, "The LLM server is not reachable. Please try again later.")
    );

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Server fail");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("not reachable");
    });
  });

  it("disables input while loading", async () => {
    const user = userEvent.setup();

    // Create a promise that doesn't resolve immediately
    let resolveResponse!: (value: { reply: string; history_length_sent: number }) => void;
    mockSendChatMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      })
    );

    render(<ChatApp />);

    const input = screen.getByLabelText("Message input");
    await user.type(input, "Loading test");
    await user.click(screen.getByLabelText("Send message"));

    // Input should be disabled while loading
    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeDisabled();
    });

    // Resolve the response
    resolveResponse({ reply: "Done", history_length_sent: 1 });

    // Input should be re-enabled
    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeEnabled();
    });
  });
});
