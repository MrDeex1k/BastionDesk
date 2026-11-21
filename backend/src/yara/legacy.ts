import { z } from "zod";

export function legacyScansAvailable(
	value = process.env.YARA_LEGACY_SCAN_NOT_BEFORE,
	now = Date.now(),
) {
	const cutoff = z.iso.datetime({ offset: true }).safeParse(value);
	return cutoff.success && Date.parse(cutoff.data) <= now;
}
