import { expect, test } from "bun:test";
import { legacyScansAvailable } from "./legacy";

test("legacy manual scans stay disabled until the configured link retirement time", () => {
	const cutoff = "2026-11-22T00:00:00Z";
	const startsAt = Date.parse(cutoff);
	expect(legacyScansAvailable("", startsAt)).toBe(false);
	expect(legacyScansAvailable("2026-11-22", startsAt)).toBe(false);
	expect(legacyScansAvailable(cutoff, startsAt - 1)).toBe(false);
	expect(legacyScansAvailable(cutoff, startsAt)).toBe(true);
});
