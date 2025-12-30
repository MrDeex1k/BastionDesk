/**
 * Custom Better-Auth Plugin: Organization Helpers
 * 
 * Rozszerzenie pluginu organizacji o dodatkowe endpointy:
 * - Dodawanie użytkownika po adresie email (zamiast userId)
 */

import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { uuidv7 } from "uuidv7";
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

					// Znajdź użytkownika po emailu
					const user = (await ctx.context.adapter.findOne({
						model: "user",
						where: [{ field: "email", value: email }],
					})) as UserRow | null;

					if (!user) {
						return ctx.json(
							{
								error: {
									code: "USER_NOT_FOUND",
									message: "Użytkownik o podanym adresie email nie istnieje w systemie",
								},
							},
							{ status: 404 },
						);
					}

					// Sprawdź czy użytkownik już jest członkiem organizacji
					const session = ctx.context.session as unknown as {
						activeOrganizationId?: string | null;
						session?: { activeOrganizationId?: string | null };
					};
					const targetOrgId =
						organizationId ??
						session?.activeOrganizationId ??
						session?.session?.activeOrganizationId ??
						null;
					
					if (!targetOrgId) {
						return ctx.json(
							{
								error: {
									code: "NO_ORGANIZATION",
									message: "Brak aktywnej organizacji",
								},
							},
							{ status: 400 },
						);
					}

					const existingMember = await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "userId", value: user.id },
							{ field: "organizationId", value: targetOrgId },
						],
					});

					if (existingMember) {
						return ctx.json(
							{
								error: {
									code: "ALREADY_MEMBER",
									message: "Użytkownik jest już członkiem tej organizacji",
								},
							},
							{ status: 409 },
						);
					}

					// Dodaj użytkownika do organizacji
					const member = (await ctx.context.adapter.create({
						model: "member",
						data: {
							id: uuidv7(),
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
