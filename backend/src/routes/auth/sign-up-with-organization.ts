import { Router } from "express";
import type { Request, Response } from "express";
import { auth } from "../../lib/auth.js";
import { sql, queryOne } from "../../lib/database.js";
import {
  emailSchema,
  passwordSchema,
  createOrganizationSchema,
} from "../../utils/validation.js";
import { z } from "zod";

const router = Router();

/**
 * Extract a Better-Auth cookie from `set-cookie` header string.
 *
 * Note: `set-cookie` can include attributes (Path, HttpOnly, Expires, etc.).
 * We only need `Cookie: <name>=<value>` to authenticate the follow-up request.
 */
function extractBetterAuthCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // We match the cookie pair only (name=value) without attributes.
  const match = setCookieHeader.match(/(better-auth\.[^=]+=[^;]+)/);
  return match?.[1] ?? null;
}

const signUpWithOrganizationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(255),
  organizationName: createOrganizationSchema.shape.name,
  organizationSlug: createOrganizationSchema.shape.slug,
  organizationLogo: createOrganizationSchema.shape.logo.optional(),
});

/**
 * POST /api/auth/sign-up-with-organization/email
 *
 * Wraps:
 * - Better-Auth signUpEmail
 * - Better-Auth organization.createOrganization
 *
 * Outcome:
 * - user is signed in (cookies set like normal sign-up)
 * - organization is created
 * - creator is set as `admin` (role in `member` table)
 */
router.post("/sign-up-with-organization/email", async (req: Request, res: Response) => {
  try {
    const body = signUpWithOrganizationSchema.parse(req.body);

    // Fast-fail on slug uniqueness (clear error message before creating user)
    const existingOrg = await queryOne<{ id: string }>(
      `SELECT id FROM organization WHERE slug = $1`,
      [body.organizationSlug],
    );
    if (existingOrg) {
      return res.status(409).json({
        success: false,
        error: {
          code: "ORGANIZATION_SLUG_EXISTS",
          message: "Organizacja o tym slugu już istnieje",
        },
      });
    }

    // 1) Create user + session (autoSignIn=true in config)
    const { headers, response } = await auth.api.signUpEmail({
      returnHeaders: true,
      body: {
        email: body.email,
        password: body.password,
        name: body.name,
      },
    });

    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      // Forward Better-Auth cookies to the client (same behavior as default endpoint)
      res.setHeader("set-cookie", setCookie);
    }

    const userId = (response as any)?.user?.id as string | undefined;
    if (!userId) {
      // In case the SDK changes shape or returns an unexpected response
      return res.status(500).json({
        success: false,
        error: {
          code: "SIGN_UP_WITH_ORG_ERROR",
          message: "Nie udało się odczytać ID użytkownika po rejestracji",
        },
      });
    }

    // 2) Create organization
    const cookieForRequest = extractBetterAuthCookie(setCookie);
    const organization = await auth.api.createOrganization({
      body: cookieForRequest
        ? {
            name: body.organizationName,
            slug: body.organizationSlug,
            logo: body.organizationLogo,
          }
        : {
            name: body.organizationName,
            slug: body.organizationSlug,
            logo: body.organizationLogo,
            // Server-side fallback when we can't forward session cookie
            userId,
          },
      headers: cookieForRequest ? { cookie: cookieForRequest } : undefined,
    });

    if (!organization?.id) {
      return res.status(500).json({
        success: false,
        error: {
          code: "ORGANIZATION_CREATE_ERROR",
          message:
            "Konto zostało utworzone, ale nie udało się utworzyć organizacji",
        },
      });
    }

    // 3) Ensure creator role is admin (your app roles: admin/analityk/pracownik)
    // Better-Auth defaults might create "owner"/"admin"; we normalize to "admin".
    await sql`
      UPDATE member
      SET role = 'admin'
      WHERE "organizationId" = ${organization.id} AND "userId" = ${userId}
    `;

    return res.status(201).json({
      ...response,
      organization,
      member: {
        userId,
        organizationId: organization.id,
        role: "admin",
      },
    });
  } catch (error) {
    // Zod validation error
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Błąd walidacji danych",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    console.error("[AUTH] Sign up with organization error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SIGN_UP_WITH_ORG_ERROR",
        message: "Nie udało się utworzyć konta i organizacji",
      },
    });
  }
});

export default router;