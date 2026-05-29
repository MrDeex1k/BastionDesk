import { getCsrfToken, refreshCsrfToken, shouldAttachCsrfToken } from "./csrf";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const configuredApiTimeout = Number.parseInt(
  import.meta.env.VITE_API_TIMEOUT_MS?.trim() ?? "",
  10,
);
const apiTimeoutMs =
  Number.isFinite(configuredApiTimeout) && configuredApiTimeout > 0
    ? configuredApiTimeout
    : 15000;

export const apiBaseUrl = configuredApiUrl.replace(/\/$/, "");

export class ApiFetchError extends Error {
  code: "NETWORK_ERROR" | "REQUEST_TIMEOUT";

  constructor(
    code: "NETWORK_ERROR" | "REQUEST_TIMEOUT",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiFetchError";
    this.code = code;
  }
}

function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  return executeApiFetch(path, init, true);
}

export async function readJsonError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data?.error?.message || data?.message || fallback;
    }

    const text = await response.text();
    return text.trim() || fallback;
  } catch {
    return response.statusText || fallback;
  }
}

function parseApiErrorCode(response: Response, data: unknown): string | null {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error &&
    "code" in data.error &&
    typeof data.error.code === "string"
  ) {
    return data.error.code;
  }

  return response.status === 403 ? "FORBIDDEN" : null;
}

function createTimeoutSignal(signal: AbortSignal | null | undefined) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), apiTimeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => controller.abort(signal.reason),
        { once: true },
      );
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => window.clearTimeout(timeoutId),
  };
}

async function executeApiFetch(
  path: string,
  init: RequestInit,
  allowRetry: boolean,
) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json");

  if (shouldAttachCsrfToken(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const { signal, cleanup } = createTimeoutSignal(init.signal);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: "include",
      ...init,
      headers,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiFetchError(
        "REQUEST_TIMEOUT",
        "Przekroczono czas oczekiwania na odpowiedź serwera",
        { cause: error },
      );
    }

    throw new ApiFetchError(
      "NETWORK_ERROR",
      "Nie udało się połączyć z serwerem",
      { cause: error },
    );
  } finally {
    cleanup();
  }

  if (!allowRetry || !shouldAttachCsrfToken(method) || response.status !== 403) {
    return response;
  }

  try {
    const data = await response.clone().json();
    const code = parseApiErrorCode(response, data);

    if (typeof code === "string" && code.startsWith("CSRF_")) {
      await refreshCsrfToken();
      return executeApiFetch(path, init, false);
    }
  } catch {
    // Ignore non-JSON error responses and return the original response below.
  }

  return response;
}
