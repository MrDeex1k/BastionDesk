import { describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireOrganizationAccess } from "./middleware.js";

interface MiddlewareResult {
	status: number;
	body?: unknown;
	nextCalled: boolean;
}

async function runMiddleware(
	requestOrganizationId: string | undefined,
	incidentVisibleInTenant: boolean,
): Promise<MiddlewareResult> {
	return await new Promise((resolve) => {
		let status = 200;
		let nextCalled = false;
		const req = {
			params: { id: "00000000-0000-4000-8000-000000000001" },
			organizationId: requestOrganizationId,
		} as unknown as Request;
		const res = {
			status(code: number) {
				status = code;
				return this;
			},
			json(body: unknown) {
				resolve({ status, body, nextCalled });
				return this;
			},
		} as unknown as Response;
		const next = (() => {
			nextCalled = true;
			resolve({ status, nextCalled });
		}) as NextFunction;

		const requireOrganizationAccess = createRequireOrganizationAccess(async (_sql, params) => {
			expect(params).toEqual(["00000000-0000-4000-8000-000000000001", requestOrganizationId]);
			return incidentVisibleInTenant ? { id: "00000000-0000-4000-8000-000000000001" } : null;
		});

		void requireOrganizationAccess(req, res, next);
	});
}

describe("incident organization access middleware", () => {
	test("INC-02-04 conceals an incident from another tenant", async () => {
		const result = await runMiddleware("organization-a", false);

		expect(result).toEqual({
			status: 404,
			body: {
				success: false,
				error: {
					code: "INCIDENT_NOT_FOUND",
					message: "Zgłoszenie nie zostało znalezione",
				},
			},
			nextCalled: false,
		});
	});

	test("allows an incident scoped to the active tenant", async () => {
		const result = await runMiddleware("organization-a", true);

		expect(result).toEqual({ status: 200, nextCalled: true });
	});
});
