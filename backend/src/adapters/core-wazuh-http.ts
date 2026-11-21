import type { Request, Response } from "express";
import { Effect } from "effect";
import { z } from "zod";
import { identityIdSchema } from "../contracts";
import { DomainError, domainErrorResponse, errorResponse } from "../contracts/errors";
import { alertReference, ruleLevelParameter } from "../core/alerts/read";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { runCore } from "../core/runtime";
import { fromNodeHeaders } from "../identity/transport";
import type { wazuhService } from "../wazuh/service";
import { WazuhError } from "../wazuh/source";

const org = z.object({ organizationId: identityIdSchema });
const draft = z.strictObject({
	revision: z.uuid().nullable(),
	origin: z.string().min(1).max(2048),
	username: z
		.string()
		.min(1)
		.max(256)
		.regex(/^[^:\s]+$/u),
	password: z.string().min(1).max(4096).optional(),
	ca: z.string().min(1).max(32768).optional(),
});
const filters = org
	.extend({
		revision: z.uuid(),
		level: ruleLevelParameter.optional(),
		from: z.iso.datetime().optional(),
		to: z.iso.datetime().optional(),
		cursor: z.uuid().optional(),
		view: z.uuid().optional(),
	})
	.strict()
	.refine(
		({ from, to }) =>
			(!from && !to) || Boolean(from && to && Date.parse(from) <= Date.parse(to)),
	);
const document = org
	.extend({
		revision: z.uuid(),
		indexName: alertReference.shape.indexName,
		documentId: alertReference.shape.documentId,
	})
	.strict();
const errors: Record<WazuhError["code"], [number, string]> = {
	INVALID_ADDRESS: [400, "Podaj prawidłowy, dostępny dla integracji adres HTTPS Indexera."],
	PASSWORD_REQUIRED: [400, "Podaj hasło konta Indexera."],
	NETWORK: [502, "Nie udało się połączyć z Indexerem Wazuh."],
	TIMEOUT: [504, "Przekroczono czas oczekiwania na odpowiedź Wazuh."],
	TLS: [502, "Nie udało się zweryfikować certyfikatu TLS Indexera."],
	AUTHENTICATION: [502, "Indexer odrzucił dane logowania."],
	PERMISSION: [502, "Konto Indexera nie ma wymaganego uprawnienia do odczytu."],
	UNAVAILABLE: [502, "Nie udało się odczytać kompletnej odpowiedzi Wazuh."],
	NOT_FOUND: [404, "Alert nie jest już dostępny w Wazuh."],
	NOT_CONFIGURED: [503, "Integracja Wazuh nie jest skonfigurowana."],
	DISABLED: [409, "Źródło Wazuh jest wyłączone."],
	STALE: [409, "Źródło lub strona wyników uległy zmianie. Rozpocznij od pierwszej strony."],
};

function parse<T>(schema: z.ZodType<T>, value: unknown) {
	const result = schema.safeParse(value);
	if (!result.success) throw new DomainError("VALIDATION_ERROR");
	return result.data;
}

export function coreWazuhRoutes(
	identity: IdentityReader,
	service: ReturnType<typeof wazuhService>,
) {
	const wrap =
		(
			admin: boolean,
			work: (
				req: Request,
				orgId: string,
				sessionId: string,
				isAdmin: boolean,
				signal: AbortSignal,
			) => Promise<unknown>,
		) =>
		async (req: Request, res: Response) => {
			res.setHeader("Cache-Control", "private, no-store");
			const request = new AbortController();
			const abort = () => request.abort();
			res.once("close", abort);
			try {
				const live = await runCore(
					currentIdentity(fromNodeHeaders(req.headers)).pipe(
						Effect.provide(identityLayer(identity)),
					),
				);
				const isAdmin = live.role === "admin";
				const { organizationId } = parse(org, req.query);
				if (
					organizationId !== live.organizationId ||
					(!isAdmin && (admin || live.role !== "analityk"))
				) {
					throw new DomainError("FORBIDDEN");
				}
				const data = await work(
					req,
					organizationId,
					live.sessionId,
					isAdmin,
					request.signal,
				);
				if (request.signal.aborted) return;
				return res.status(200).json({ success: true, data });
			} catch (error) {
				if (request.signal.aborted) return;
				if (error instanceof DomainError) {
					const result = domainErrorResponse(error);
					return res.status(result.status).json(result.body);
				}
				const code = error instanceof WazuhError ? error.code : "UNAVAILABLE";
				const [status, defaultMessage] = errors[code];
				const message =
					code === "STALE" && admin
						? "Źródło Wazuh uległo zmianie. Wczytaj aktualną konfigurację."
						: defaultMessage;
				return res.status(status).json(errorResponse("WAZUH_" + code, message));
			} finally {
				res.off("close", abort);
			}
		};
	const configure = (activate: boolean) =>
		wrap(true, (req, id, _session, _admin, signal) => {
			const { revision, ...settings } = parse(draft, req.body);
			return service.configure(id, settings, revision, activate, signal);
		});
	return [
		{
			method: "get" as const,
			paths: ["/api/wazuh/source"],
			handle: wrap(false, (_, id, __, admin) => service.status(id, admin)),
		},
		{
			method: "post" as const,
			paths: ["/api/wazuh/source/check"],
			handle: configure(false),
		},
		{
			method: "put" as const,
			paths: ["/api/wazuh/source"],
			handle: configure(true),
		},
		{
			method: "patch" as const,
			paths: ["/api/wazuh/source"],
			handle: wrap(true, (req, id, _session, _admin, signal) => {
				const { revision, enabled } = parse(
					z.strictObject({ revision: z.uuid(), enabled: z.boolean() }),
					req.body,
				);
				return service.setEnabled(id, revision, enabled, signal);
			}),
		},
		{
			method: "delete" as const,
			paths: ["/api/wazuh/source"],
			handle: wrap(true, async (req, id) => {
				await service.remove(id, parse(z.uuid(), req.query.revision));
				return null;
			}),
		},
		{
			method: "get" as const,
			paths: ["/api/wazuh/alerts"],
			handle: wrap(false, (req, id, session, _admin, signal) => {
				const { revision, from, to, level, cursor, view } = parse(filters, req.query);
				return service.list(
					id,
					session,
					revision,
					{ from, to, level },
					signal,
					cursor,
					view,
				);
			}),
		},
		...([false, true] as const).map((full) => ({
			method: "get" as const,
			paths: [full ? "/api/wazuh/alerts/json" : "/api/wazuh/alerts/detail"],
			handle: wrap(false, (req, id) => {
				const { revision, indexName, documentId } = parse(document, req.query);
				return service.document(id, revision, { indexName, documentId }, full);
			}),
		})),
	];
}
