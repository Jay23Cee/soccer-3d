// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

let errorSpy;
let warnSpy;

function serializeConsoleArg(arg) {
  if (typeof arg === "string") {
    return arg;
  }

  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function failForConsole(method, args) {
  const formatted = args.map(serializeConsoleArg).join(" ");
  throw new Error(`Unexpected ${method} in test: ${formatted}`);
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    failForConsole("console.error", args);
  });

  warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    failForConsole("console.warn", args);
  });
});

afterEach(() => {
  errorSpy?.mockRestore();
  warnSpy?.mockRestore();
});
