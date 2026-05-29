const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const configuredApiTimeout = Number.parseInt(
	import.meta.env.VITE_API_TIMEOUT_MS?.trim() ?? "",
	10,
);
const csrfTimeoutMs =
	Number.isFinite(configuredApiTimeout) && configuredApiTimeout > 0
		? configuredApiTimeout
		: 15000;

function csrfUrl() {
	return configuredApiUrl
		? `${configuredApiUrl.replace(/\/$/, "")}/api/csrf`
		: "/api/csrf";
}

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

export function shouldAttachCsrfToken(method: string): boolean {
	return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function clearCsrfToken(): void {
	csrfToken = null;
	csrfTokenRequest = null;
}

export async function refreshCsrfToken(): Promise<string> {
	clearCsrfToken();
	return getCsrfToken();
}

export async function getCsrfToken(): Promise<string> {
	if (csrfToken) {
		return csrfToken;
	}

	if (csrfTokenRequest) {
		return csrfTokenRequest;
	}

	csrfTokenRequest = requestCsrfToken();

	try {
		csrfToken = await csrfTokenRequest;
		return csrfToken;
	} finally {
		csrfTokenRequest = null;
	}
}

async function requestCsrfToken(): Promise<string> {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort("timeout"), csrfTimeoutMs);

	let response: Response;
	try {
		response = await fetch(csrfUrl(), {
			method: "GET",
			credentials: "include",
			headers: {
				Accept: "application/json",
			},
			signal: controller.signal,
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error("Przekroczono czas oczekiwania na pobranie tokenu CSRF", {
				cause: error,
			});
		}
		throw new Error("Nie udało się pobrać tokenu CSRF", { cause: error });
	} finally {
		window.clearTimeout(timeoutId);
	}

	if (!response.ok) {
		throw new Error("Nie udało się pobrać tokenu CSRF");
	}

	const data = await response.json();
	const token = data?.data?.token;
	if (typeof token !== "string" || token.length === 0) {
		throw new Error("Serwer nie zwrócił poprawnego tokenu CSRF");
	}

	return token;
}
