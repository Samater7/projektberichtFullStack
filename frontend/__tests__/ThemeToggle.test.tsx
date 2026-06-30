import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatApp from "@/app/components/ChatApp";

// Mock the API and health modules
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    sendChatMessage: jest.fn(),
  };
});

jest.mock("@/lib/health", () => ({
  checkHealth: jest.fn().mockResolvedValue(true),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark theme", () => {
    render(<ChatApp />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles to light theme", async () => {
    const user = userEvent.setup();
    render(<ChatApp />);

    const toggleBtn = screen.getByLabelText(/switch to light mode/i);
    await user.click(toggleBtn);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("chat-theme")).toBe("light");
  });

  it("persists theme across reloads", () => {
    localStorage.setItem("chat-theme", "light");

    render(<ChatApp />);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
