import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Explicit, not `test.globals: true` — keeps every test file's imports
// explicit (this repo's established convention) rather than relying on
// Jest-style ambient globals. Without this, RTL never unmounts between
// tests within the same file, and DOM from every previous test in the file
// stays in document.body — found by SessionSelector.test.tsx's "multiple
// elements with the text: Race" failures piling up across its own tests.
afterEach(() => {
  cleanup();
});
