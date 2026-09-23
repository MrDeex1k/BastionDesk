const knownCodes = new Set([
	"RABBITMQ_URL_REQUIRED",
	"RABBITMQ_TLS_REQUIRED",
	"CONFIRM_TIMEOUT",
	"UNROUTABLE_MESSAGE",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"ENOENT",
	"EACCES",
	"ERR_INVALID_URL",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"CERT_HAS_EXPIRED",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"SELF_SIGNED_CERT_IN_CHAIN",
]);
export function safeWorkerError(error: unknown): string {
	if (!error || typeof error !== "object") return "UNKNOWN_ERROR";
	const value = error as { code?: unknown; message?: unknown };
	for (const candidate of [value.code, value.message])
		if (typeof candidate === "string" && knownCodes.has(candidate)) return candidate;
	return error instanceof TypeError ? "TYPE_ERROR" : "WORKER_OPERATION_FAILED";
}
