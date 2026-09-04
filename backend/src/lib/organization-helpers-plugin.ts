/**
 * Custom Better-Auth Plugin: Organization Helpers
 *
 * Rozszerzenie pluginu organizacji o dodatkowe endpointy:
 * - Dodawanie użytkownika po adresie email (zamiast userId)
 */

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";

type UserRow = {
	id: string;
	email: string;
	name: string | null;
	emailVerified: boolean;
	createdAt: Date;
	updatedAt: Date | null;
};

type MemberRow = {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
	createdAt: Date;
	updatedAt?: Date | null;
};

type SessionContext = {
	user?: { id?: string };
	userId?: string;
	activeOrganizationId?: string | null;
	session?: {
		userId?: string;
		activeOrganizationId?: string | null;
	};
};

export const organizationHelpersPlugin = () => {
	return {
		id: "organization-helpers",
		endpoints: {
			/**
			 * POST /api/auth/organization/add-member-by-email
			 *
			 * Dodaje użytkownika do organizacji na podstawie adresu email.
			 * Znajduje userId automatycznie, a następnie dodaje do organizacji.
			 */
			addMemberByEmail: createAuthEndpoint(
				"/organization/add-member-by-email",
				{
					method: "POST",
					body: z.object({
						email: z.string().email("Nieprawidłowy format adresu email"),
						role: z.enum(["admin", "analityk", "pracownik"]),
						organizationId: z.string().optional(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const { email, role, organizationId } = ctx.body;
					const session = ctx.context.session as unknown as SessionContext;
					const actorUserId =
						session.user?.id ?? session.userId ?? session.session?.userId;
					const activeOrganizationId =
						session.activeOrganizationId ??
						session.session?.activeOrganizationId ??
						null;

					if (!actorUserId || !activeOrganizationId) {
						throw APIError.from("FORBIDDEN", {
							code: "NO_ORGANIZATION",
							message: "Brak aktywnej organizacji",
						});
					}

					if (organizationId && organizationId !== activeOrganizationId) {
						throw APIError.from("FORBIDDEN", {
							code: "ORGANIZATION_ACCESS_DENIED",
							message: "Nie można dodawać członków do innej organizacji",
						});
					}

					const actorMembership = (await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "userId", value: actorUserId },
							{ field: "organizationId", value: activeOrganizationId },
						],
					})) as MemberRow | null;

					if (actorMembership?.role !== "admin") {
						throw APIError.from("FORBIDDEN", {
							code: "FORBIDDEN",
							message: "Tylko administrator może dodawać członków organizacji",
						});
					}

					// Znajdź użytkownika po emailu
					const user = (await ctx.context.adapter.findOne({
						model: "user",
						where: [{ field: "email", value: email }],
					})) as UserRow | null;

					if (!user) {
						throw APIError.from("NOT_FOUND", {
							code: "USER_NOT_FOUND",
							message: "Użytkownik o podanym adresie email nie istnieje w systemie",
						});
					}

					// Sprawdź czy użytkownik już jest członkiem organizacji
					const targetOrgId = activeOrganizationId;

					const existingMember = await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "userId", value: user.id },
							{ field: "organizationId", value: targetOrgId },
						],
					});

					if (existingMember) {
						throw APIError.from("CONFLICT", {
							code: "ALREADY_MEMBER",
							message: "Użytkownik jest już członkiem tej organizacji",
						});
					}

					// Dodaj użytkownika do organizacji
					const member = (await ctx.context.adapter.create({
						model: "member",
						data: {
							userId: user.id,
							organizationId: targetOrgId,
							role,
							createdAt: new Date(),
						},
					})) as MemberRow;

					// Pobierz pełne dane użytkownika dla odpowiedzi
					const memberWithUser = {
						...member,
						user: {
							id: user.id,
							email: user.email,
							name: user.name,
							emailVerified: user.emailVerified,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					};

					return ctx.json({
						member: memberWithUser,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
