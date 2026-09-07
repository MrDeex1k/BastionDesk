import { afterEach, beforeEach, expect, setSystemTime } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import { clearCsrfToken } from "../../src/lib/csrf";
import { resetNetwork, unexpectedRequests } from "./network";

resetNetwork();
expect.extend(matchers);
declare module "bun:test" {
  interface Matchers<T> extends Omit<TestingLibraryMatchers<void, T>, "toBeEmpty" | "toHaveRole"> {}
}
beforeEach(() => {
  setSystemTime(new Date("2026-09-04T12:00:00Z"));
  clearCsrfToken();
  resetNetwork();
});
afterEach(() => {
  cleanup();
  clearCsrfToken();
  setSystemTime();
  expect(unexpectedRequests()).toEqual([]);
});
