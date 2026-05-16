const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";

export const apiBaseUrl = configuredApiUrl.replace(/\/$/, "");

function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
  });
}

export async function readJsonError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || fallback;
  } catch {
    return fallback;
  }
}
