import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
