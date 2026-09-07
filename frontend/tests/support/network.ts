import { mock } from "bun:test";

type Handler = (request: Request) => Response | Promise<Response>;
const handlers = new Map<string, Handler>();
const unexpected: string[] = [];
export const network = mock(async (input: string | URL | Request, init?: RequestInit) => {
  const request =
    input instanceof Request
      ? input
      : new Request(new URL(String(input), window.location.origin), init);
  const path = new URL(request.url).pathname;
  if (path === "/api/csrf") return Response.json({ data: { token: "component-csrf" } });
  const handler = handlers.get(`${request.method} ${path}`);
  if (!handler) {
    unexpected.push(`${request.method} ${path}`);
    throw new Error(`Unexpected network request: ${request.method} ${path}`);
  }
  return handler(request);
});
export function respond(method: string, path: string, handler: Handler) {
  handlers.set(`${method} ${path}`, handler);
}
export function resetNetwork() {
  handlers.clear();
  unexpected.length = 0;
  network.mockClear();
  globalThis.fetch = network as unknown as typeof fetch;
  window.fetch = network as unknown as typeof fetch;
}
export function unexpectedRequests() {
  return [...unexpected];
}
