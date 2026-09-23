import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../lib/api-response";
import { coreIdentity } from "../adapters/core-identity";
import { fromNodeHeaders } from "../identity/transport";
import { domainErrorResponse } from "../contracts/errors";
import type { UserRole } from "../types";

export interface AuthenticatedUser {
	id: string;
}
export interface AuthenticatedSession {
	id: string;
	userId: string;
	expiresAt: Date;
}
export interface AuthenticatedRequest extends Request {
	user: AuthenticatedUser;
	session: AuthenticatedSession;
	organizationId?: string;
	memberRole?: UserRole;
}
export function getRequiredOrganizationId(req: AuthenticatedRequest, res: Response): string | null {
	if (req.organizationId) {
		return req.organizationId;
	}

	sendErrorResponse(res, 403, "NO_ORGANIZATION", "Użytkownik nie należy do żadnej organizacji");
	return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const identity = await coreIdentity.read(fromNodeHeaders(req.headers));
		if (!identity) {
			sendErrorResponse(res, 401, "UNAUTHORIZED", "Wymagane zalogowanie");
			return;
		}
		const authenticated = req as AuthenticatedRequest;
		authenticated.user = { id: identity.subject };
		authenticated.session = {
			id: identity.sessionId,
			userId: identity.subject,
			expiresAt: new Date(identity.sessionExpiresAt * 1000),
		};
		authenticated.organizationId = identity.organizationId;
		authenticated.memberRole = identity.role;
		next();
	} catch (error) {
		const mapped = domainErrorResponse(error);
		res.status(mapped.status).json(mapped.body);
	}
}
export function requireRole(roles: UserRole[]) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const identity = req as AuthenticatedRequest;
		if (!identity.memberRole || !roles.includes(identity.memberRole)) {
			sendErrorResponse(res, 403, "FORBIDDEN", "Brak uprawnień");
			return;
		}
		next();
	};
}
