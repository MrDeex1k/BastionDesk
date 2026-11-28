import type { ScanState } from "./store";

export function attachmentDownloadAllowed(state: ScanState) {
	return state === "clean" || state === "unscanned";
}

export class AttachmentDownloadBlocked extends Error {
	constructor(readonly state: ScanState) {
		super("YARA_DOWNLOAD_BLOCKED");
	}
}
