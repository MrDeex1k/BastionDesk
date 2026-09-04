import { describe, expect, test } from "bun:test";
import { organizationHelpersPlugin } from "./organization-helpers-plugin.js";

type JsonBody = Record<string, unknown>;

interface EndpointContextOptions {
	activeOrganizationId: string;
	actorId: string;
	actorRole: "admin" | "analityk" | "pracownik";
	requestedOrganizationId?: string;
}

function createEndpointContext(options: EndpointContextOptions) {
	let createCalls = 0;

	const context = {
		body: {
			email: "target@example.test",
			role: "analityk" as const,
			...(options.requestedOrganizationId
				? { organizationId: options.requestedOrganizationId }
				: {}),
		},
		context: {
			session: {
				user: { id: options.actorId },
				session: { activeOrganizationId: options.activeOrganizationId },
			},
			adapter: {
				findOne: async ({
					model,
					where,
				}: {
					model: string;
					where: Array<{ field: string; value: string }>;
				}) => {
					if (model === "user") {
						return {
							id: "target-user",
							email: "target@example.test",
							name: "Target User",
							emailVerified: true,
							createdAt: new Date("2026-09-04T00:00:00.000Z"),
							updatedAt: new Date("2026-09-04T00:00:00.000Z"),
						};
					}

					const userId = where.find((condition) => condition.field === "userId")?.value;
					const organizationId = where.find(
						(condition) => condition.field === "organizationId",
					)?.value;

					if (
						model === "member" &&
						userId === options.actorId &&
						organizationId === options.activeOrganizationId
					) {
						return {
							id: "actor-member",
							userId,
							organizationId,
							role: options.actorRole,
						};
					}

					return null;
				},
				create: async ({ data }: { data: Record<string, unknown> }) => {
					createCalls++;
					return data;
				},
			},
		},
		json: (body: JsonBody) => body,
		responseHeaders: new Headers(),
	};

	return { context, getCreateCalls: () => createCalls };
}

describe("organization add-member authorization", () => {
	test("ORG-02-02 allows an admin in the active organization", async () => {
		const { context, getCreateCalls } = createEndpointContext({
			activeOrganizationId: "organization-a",
			actorId: "admin-a",
			actorRole: "admin",
		});
		const endpoint = organizationHelpersPlugin().endpoints.addMemberByEmail;

		const result = (await endpoint(context as never)) as unknown as JsonBody;

		expect(result).toHaveProperty("member.organizationId", "organization-a");
		expect(result).toHaveProperty("member.userId", "target-user");
		expect(getCreateCalls()).toBe(1);
	});

	test("ORG-02-06 rejects a non-admin member", async () => {
		const { context, getCreateCalls } = createEndpointContext({
			activeOrganizationId: "organization-a",
			actorId: "employee-a",
			actorRole: "pracownik",
		});
		const endpoint = organizationHelpersPlugin().endpoints.addMemberByEmail;

		let rejection: unknown;
		try {
			await endpoint(context as never);
		} catch (error) {
			rejection = error;
		}
		expect(rejection).toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
			body: {
				code: "FORBIDDEN",
				message: "Tylko administrator może dodawać członków organizacji",
			},
		});
		expect(getCreateCalls()).toBe(0);
	});

	test("ORG-02-06 rejects an organization different from the active tenant", async () => {
		const { context, getCreateCalls } = createEndpointContext({
			activeOrganizationId: "organization-a",
			actorId: "admin-a",
			actorRole: "admin",
			requestedOrganizationId: "organization-b",
		});
		const endpoint = organizationHelpersPlugin().endpoints.addMemberByEmail;

		let rejection: unknown;
		try {
			await endpoint(context as never);
		} catch (error) {
			rejection = error;
		}
		expect(rejection).toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
			body: {
				code: "ORGANIZATION_ACCESS_DENIED",
				message: "Nie można dodawać członków do innej organizacji",
			},
		});
		expect(getCreateCalls()).toBe(0);
	});
});
