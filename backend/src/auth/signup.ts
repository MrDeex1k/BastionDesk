import { z } from "zod";
import { auth } from "../lib/auth";
import { queryOne, sql } from "../lib/database";
import { createOrganizationSchema, emailSchema, passwordSchema } from "../utils/validation";
import { checkCsrf } from "./csrf";
import { failure } from "./application";

const schema = z.object({
	email: emailSchema,
	password: passwordSchema,
	name: z.string().min(1).max(255),
	organizationName: createOrganizationSchema.shape.name,
	organizationSlug: createOrganizationSchema.shape.slug,
	organizationLogo: createOrganizationSchema.shape.logo.optional(),
});

export async function signup(request: Request): Promise<Response> {
	const forbidden = await checkCsrf(request);
	if (forbidden) return forbidden;
	const parsed = schema.safeParse(await request.json());
	if (!parsed.success) return failure(400, "VALIDATION_ERROR");
	const body = parsed.data;
	if (await queryOne("SELECT id FROM organization WHERE slug = $1", [body.organizationSlug]))
		return failure(409, "ORGANIZATION_SLUG_EXISTS");
	const { headers, response } = await auth.api.signUpEmail({
		returnHeaders: true,
		body: { email: body.email, password: body.password, name: body.name },
	});
	const userId = response.user.id;
	const cookies = headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
	const organization = await auth.api.createOrganization({
		body: {
			name: body.organizationName,
			slug: body.organizationSlug,
			logo: body.organizationLogo,
			...(!cookies ? { userId } : {}),
		},
		headers: cookies ? { cookie: cookies } : undefined,
	});
	if (!organization) return failure(500, "ORGANIZATION_CREATE_ERROR");
	await sql`UPDATE session SET "activeOrganizationId" = ${organization.id}, "updatedAt" = now() WHERE "userId" = ${userId}`;
	const output = new Headers();
	for (const value of headers.getSetCookie()) output.append("set-cookie", value);
	return Response.json(
		{
			...response,
			organization,
			member: { userId, organizationId: organization.id, role: "admin" },
		},
		{ status: 201, headers: output },
	);
}
