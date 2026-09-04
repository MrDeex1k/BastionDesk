const prefix = "[baseline-auth-fixture]";
const baseUrl = process.env.BASELINE_BASE_URL ?? "http://localhost:4567";
const runId = process.env.BASELINE_RUN_ID ?? `${Date.now()}-${process.pid}`;

if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
  throw new Error("BASELINE_RUN_ID may contain only letters, digits, _ and -");
}

const composeFiles = [
  "-f",
  "docker-compose.yml",
  "-f",
  "docker-compose.phase0.yml",
];
const password = `Bastion-${crypto.randomUUID()}-9!`;
const passwords = new Map<string, string>();
const screenshotFilename = "evidence.png";
const attachmentFilename = "evidence.txt";
const screenshotBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const attachmentBytes = new TextEncoder().encode(`phase-0 attachment ${runId}`);
const identities = {
  adminA: {
    email: `admin-a-${runId}@phase0.invalid`,
    name: "Phase 0 Admin A",
    organizationName: `Baseline A ${runId}`,
    organizationSlug: `baseline-a-${runId}`.toLowerCase(),
  },
  adminB: {
    email: `admin-b-${runId}@phase0.invalid`,
    name: "Phase 0 Admin B",
    organizationName: `Baseline B ${runId}`,
    organizationSlug: `baseline-b-${runId}`.toLowerCase(),
  },
  analystA1: {
    email: `analyst-a1-${runId}@phase0.invalid`,
    name: "Phase 0 Analyst A1",
  },
  analystA2: {
    email: `analyst-a2-${runId}@phase0.invalid`,
    name: "Phase 0 Analyst A2",
  },
  employeeA1: {
    email: `employee-a1-${runId}@phase0.invalid`,
    name: "Phase 0 Employee A1",
  },
  employeeA2: {
    email: `employee-a2-${runId}@phase0.invalid`,
    name: "Phase 0 Employee A2",
  },
  analystB: {
    email: `analyst-b-${runId}@phase0.invalid`,
    name: "Phase 0 Analyst B",
  },
  employeeB: {
    email: `employee-b-${runId}@phase0.invalid`,
    name: "Phase 0 Employee B",
  },
  userNoOrg: {
    email: `no-org-${runId}@phase0.invalid`,
    name: "Phase 0 No Organization",
  },
  userUnverified: {
    email: `unverified-${runId}@phase0.invalid`,
    name: "Phase 0 Unverified",
  },
  duplicateSlugAttempt: {
    email: `duplicate-slug-${runId}@phase0.invalid`,
    name: "Phase 0 Duplicate Slug",
  },
} as const;

type JsonObject = Record<string, unknown>;
type BasicIdentity = { readonly email: string; readonly name: string };
type ApiClient = { jar: CookieJar; csrfToken: string };
const fixtureIncidentIds: string[] = [];

class CookieJar {
  private readonly cookies = new Map<string, string>();

  add(response: Response): void {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const values = headers.getSetCookie?.() ?? [
      response.headers.get("set-cookie") ?? "",
    ];
    for (const value of values) {
      const cookiePair = value.split(";", 1)[0] ?? "";
      const separator = cookiePair.indexOf("=");
      if (separator < 1) continue;
      const name = cookiePair.slice(0, separator).trim();
      const cookieValue = cookiePair.slice(separator + 1).trim();
      if (!cookieValue || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(value))
        this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
  }

  header(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function passwordFor(email: string): string {
  return passwords.get(email) ?? password;
}

async function command(
  commandName: string,
  args: string[],
  quiet = false,
): Promise<string> {
  const processHandle = Bun.spawn([commandName, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${commandName} ${args.join(" ")} failed:\n${stderr || stdout}`,
    );
  }
  if (!quiet && stderr.trim()) process.stderr.write(stderr);
  return stdout.trim();
}

async function compose(args: string[], quiet = false): Promise<string> {
  return command("docker", ["compose", ...composeFiles, ...args], quiet);
}

async function request(
  url: string,
  options: RequestInit = {},
  jar?: CookieJar,
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (jar?.header()) headers.set("cookie", jar.header());
  const response = await fetch(url, {
    ...options,
    headers,
    redirect: "manual",
  });
  jar?.add(response);
  return response;
}

async function jsonRequest(
  pathname: string,
  options: RequestInit,
  jar: CookieJar,
  expectedStatus: number,
): Promise<JsonObject> {
  const response = await request(`${baseUrl}${pathname}`, options, jar);
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname}: expected HTTP ${expectedStatus}, got ${response.status}: ${text}`,
    );
  }
  return text ? (JSON.parse(text) as JsonObject) : {};
}

async function jsonRequestWithStatus(
  pathname: string,
  options: RequestInit,
  jar: CookieJar,
): Promise<{ status: number; body: unknown }> {
  const response = await request(`${baseUrl}${pathname}`, options, jar);
  const text = await response.text();
  if (!text) return { status: response.status, body: {} };
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { responseText: text } };
  }
}

async function csrf(jar: CookieJar): Promise<string> {
  const body = await jsonRequest("/api/csrf", { method: "GET" }, jar, 200);
  const token = (body.data as JsonObject | undefined)?.token;
  if (typeof token !== "string" || !token)
    throw new Error("CSRF endpoint returned no token");
  return token;
}

function expectValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function responseData(body: JsonObject): JsonObject {
  const data = body.data;
  expectValue(
    data && typeof data === "object" && !Array.isArray(data),
    "response has no data object",
  );
  return data as JsonObject;
}

function responseItems(body: JsonObject): JsonObject[] {
  const data = body.data;
  expectValue(Array.isArray(data), "response has no data array");
  return data as JsonObject[];
}

async function apiJson(
  client: ApiClient,
  pathname: string,
  method: string,
  body: unknown,
  expectedStatus = 200,
): Promise<JsonObject> {
  return jsonRequest(
    pathname,
    {
      method,
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-csrf-token": client.csrfToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    client.jar,
    expectedStatus,
  );
}

async function apiGet(
  client: ApiClient,
  pathname: string,
  expectedStatus = 200,
): Promise<JsonObject> {
  return jsonRequest(
    pathname,
    {
      method: "GET",
      headers: { origin: baseUrl, "x-csrf-token": client.csrfToken },
    },
    client.jar,
    expectedStatus,
  );
}

async function apiMutation4xx(
  client: ApiClient,
  pathname: string,
  method: string,
  body: unknown,
): Promise<JsonObject> {
  const result = await jsonRequestWithStatus(
    pathname,
    {
      method,
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-csrf-token": client.csrfToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    client.jar,
  );
  expectValue(
    result.status >= 400 && result.status < 500,
    `${pathname}: expected HTTP 4xx, got ${result.status}: ${JSON.stringify(result.body)}`,
  );
  return result.body as JsonObject;
}

async function apiForm(
  client: ApiClient,
  pathname: string,
  formData: FormData,
  expectedStatus = 200,
): Promise<JsonObject> {
  const response = await request(
    `${baseUrl}${pathname}`,
    {
      method: "POST",
      headers: { origin: baseUrl, "x-csrf-token": client.csrfToken },
      body: formData,
    },
    client.jar,
  );
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname}: expected HTTP ${expectedStatus}, got ${response.status}: ${text}`,
    );
  }
  return text ? (JSON.parse(text) as JsonObject) : {};
}

async function assertDownload(
  client: ApiClient,
  pathname: string,
  expectedBytes: Uint8Array,
  expectedMime: string,
  expectedFilename: string,
  label: string,
): Promise<void> {
  const response = await request(
    `${baseUrl}${pathname}`,
    {
      method: "GET",
      headers: { origin: baseUrl, "x-csrf-token": client.csrfToken },
    },
    client.jar,
  );
  expectValue(
    response.status === 200,
    `${label}: download returned HTTP ${response.status}`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  expectBytes(bytes, expectedBytes, label);
  expectValue(
    response.headers.get("content-type")?.split(";", 1)[0] === expectedMime,
    `${label}: invalid MIME`,
  );
  expectValue(
    response.headers.get("content-length") === String(expectedBytes.length),
    `${label}: invalid Content-Length`,
  );
  const disposition = response.headers.get("content-disposition") ?? "";
  expectValue(
    disposition.includes("attachment") &&
      disposition.includes(expectedFilename),
    `${label}: unsafe or missing Content-Disposition`,
  );
}

function hasIncident(items: JsonObject[], incidentId: string): boolean {
  return items.some((item) => item.id === incidentId);
}

async function listOrganizations(client: ApiClient): Promise<JsonObject[]> {
  const result = await jsonRequestWithStatus(
    "/api/auth/organization/list",
    {
      method: "GET",
      headers: { origin: baseUrl, "x-csrf-token": client.csrfToken },
    },
    client.jar,
  );
  expectValue(
    result.status === 200,
    `organization list returned HTTP ${result.status}`,
  );
  expectValue(Array.isArray(result.body), "organization list is not an array");
  return result.body as JsonObject[];
}

async function listMembers(
  client: ApiClient,
  organizationId?: string,
): Promise<JsonObject[]> {
  const params = new URLSearchParams({
    limit: "100",
    sortBy: "createdAt",
    sortDirection: "desc",
  });
  if (organizationId) params.set("organizationId", organizationId);
  const body = await apiGet(
    client,
    `/api/auth/organization/list-members?${params}`,
  );
  expectValue(
    Array.isArray(body.members),
    "organization member list is not an array",
  );
  return body.members as JsonObject[];
}

function memberByEmail(
  members: JsonObject[],
  email: string,
): JsonObject | undefined {
  return members.find(
    (member) => (member.user as JsonObject | undefined)?.email === email,
  );
}

async function addMember(
  admin: ApiClient,
  identity: BasicIdentity,
  role: "admin" | "analityk" | "pracownik",
): Promise<string> {
  const body = await apiJson(
    admin,
    "/api/auth/organization/add-member-by-email",
    "POST",
    {
      email: identity.email,
      role,
    },
  );
  const member = body.member as JsonObject | undefined;
  expectValue(
    typeof member?.id === "string",
    `member ID missing for ${identity.email}`,
  );
  return member.id;
}

async function assertErrorCode(
  body: JsonObject,
  expectedCode: string,
): Promise<void> {
  const error = body.error as JsonObject | undefined;
  const actualCode = error?.code ?? body.code;
  expectValue(
    actualCode === expectedCode,
    `expected ${expectedCode}, got ${String(actualCode)} in ${JSON.stringify(body)}`,
  );
}

async function registerAdmin(identity: {
  readonly email: string;
  readonly name: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
}): Promise<CookieJar> {
  const jar = new CookieJar();
  const token = await csrf(jar);
  await jsonRequest(
    "/api/auth/sign-up-with-organization/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-csrf-token": token,
      },
      body: JSON.stringify({
        ...identity,
        password: passwordFor(identity.email),
      }),
    },
    jar,
    201,
  );
  return jar;
}

async function registerUser(identity: BasicIdentity): Promise<CookieJar> {
  const jar = new CookieJar();
  await jsonRequest(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({
        ...identity,
        password: passwordFor(identity.email),
      }),
    },
    jar,
    200,
  );
  return jar;
}

async function waitForEmailLink(
  mailpitUrl: string,
  email: string,
  pathFragment: string,
): Promise<string> {
  const query = encodeURIComponent(`to:${email}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(
      `${mailpitUrl}/view/latest.html?query=${query}`,
    );
    if (response.ok) {
      const html = await response.text();
      const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(
        (match) => match[1]!,
      );
      const match = links.find((link) => link.includes(pathFragment));
      if (match) return match.replaceAll("&amp;", "&");
    }
    await Bun.sleep(250);
  }
  throw new Error(`verification email for ${email} was not captured`);
}

async function verifyEmail(
  mailpitUrl: string,
  email: string,
  jar: CookieJar,
): Promise<void> {
  const link = await waitForEmailLink(
    mailpitUrl,
    email,
    "/api/auth/verify-email",
  );
  const response = await request(link, { headers: { origin: baseUrl } }, jar);
  if (![200, 302, 303].includes(response.status)) {
    throw new Error(
      `email verification for ${email} returned HTTP ${response.status}`,
    );
  }
}

async function assertWrongPasswordRejected(
  email: string,
  wrongPassword: string,
): Promise<void> {
  const jar = new CookieJar();
  const response = await request(
    `${baseUrl}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ email, password: wrongPassword }),
    },
    jar,
  );
  expectValue(
    response.status >= 400 && response.status < 500,
    `${email}: wrong password was accepted`,
  );
  expectValue(
    !jar.header().includes("better-auth"),
    `${email}: failed sign-in returned an authentication cookie`,
  );
  await assertErrorCode(
    await apiGet({ jar, csrfToken: await csrf(jar) }, "/api/incidents/my", 401),
    "UNAUTHORIZED",
  );
}

async function assertLogoutInvalidatesSession(email: string): Promise<void> {
  const client = await signInAndAssertSession(email, null);
  await apiJson(client, "/api/auth/sign-out", "POST", undefined);
  await assertErrorCode(
    await apiGet(client, "/api/incidents/my", 401),
    "UNAUTHORIZED",
  );
}

async function resetPasswordThroughMailpit(
  mailpitUrl: string,
  email: string,
): Promise<void> {
  const jar = new CookieJar();
  await jsonRequest(
    "/api/auth/request-password-reset",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ email, redirectTo: `${baseUrl}/reset-password` }),
    },
    jar,
    200,
  );
  const resetLink = await waitForEmailLink(
    mailpitUrl,
    email,
    "/reset-password",
  );
  const resetUrl = new URL(resetLink);
  const token =
    resetUrl.searchParams.get("token") ??
    resetUrl.pathname.match(/\/reset-password\/([^/]+)$/)?.[1] ??
    null;
  expectValue(token, `password reset email for ${email} contains no token`);
  const oldPassword = passwordFor(email);
  const newPassword = `Reset-${crypto.randomUUID()}-9!`;
  await jsonRequest(
    "/api/auth/reset-password",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ newPassword, token }),
    },
    jar,
    200,
  );
  await assertWrongPasswordRejected(email, oldPassword);
  passwords.set(email, newPassword);
  await signInAndAssertSession(email, null);
}

async function assertDuplicateOrganizationSlugRejected(): Promise<void> {
  const jar = new CookieJar();
  const token = await csrf(jar);
  const body = await jsonRequest(
    "/api/auth/sign-up-with-organization/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-csrf-token": token,
      },
      body: JSON.stringify({
        ...identities.duplicateSlugAttempt,
        password,
        organizationName: "Must not be created",
        organizationSlug: identities.adminA.organizationSlug,
      }),
    },
    jar,
    409,
  );
  await assertErrorCode(body, "ORGANIZATION_SLUG_EXISTS");
  const rows = await databaseRows(
    `SELECT email FROM "user" WHERE email = '${identities.duplicateSlugAttempt.email}';`,
  );
  expectValue(
    rows.length === 0,
    "duplicate slug attempt created a partial user",
  );
}

async function signInAndAssertSession(
  email: string,
  expectedOrganizationId: string | null,
): Promise<ApiClient> {
  const jar = new CookieJar();
  await jsonRequest(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ email, password: passwordFor(email) }),
    },
    jar,
    200,
  );
  if (expectedOrganizationId) {
    await jsonRequest(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ organizationId: expectedOrganizationId }),
      },
      jar,
      200,
    );
  }
  const session = await jsonRequest(
    "/api/auth/get-session",
    { method: "GET" },
    jar,
    200,
  );
  const user = session.user as JsonObject | undefined;
  const sessionData = session.session as JsonObject | undefined;
  if (user?.email !== email)
    throw new Error(`session belongs to another user than ${email}`);
  const activeOrganizationId = sessionData?.activeOrganizationId ?? null;
  if (activeOrganizationId !== expectedOrganizationId) {
    throw new Error(
      `${email}: expected active organization ${expectedOrganizationId}, got ${String(activeOrganizationId)}`,
    );
  }
  return { jar, csrfToken: await csrf(jar) };
}

async function createIncident(
  client: ApiClient,
  description: string,
  withFiles = false,
): Promise<string> {
  const form = new FormData();
  form.set("userDescription", description);
  if (withFiles) {
    form.set(
      "screenshot",
      new File([screenshotBytes], screenshotFilename, { type: "image/png" }),
    );
    form.set(
      "attachment",
      new File([attachmentBytes], attachmentFilename, { type: "text/plain" }),
    );
  }
  const incident = responseData(
    await apiForm(client, "/api/incidents", form, 201),
  );
  expectValue(typeof incident.id === "string", "created incident has no ID");
  fixtureIncidentIds.push(incident.id);
  return incident.id;
}

function expectBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  expectValue(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${label}: downloaded bytes differ from uploaded bytes`,
  );
}

async function waitForLlmCategories(
  client: ApiClient,
  incidentIds: readonly string[],
): Promise<void> {
  const allowed = new Set(["Czerwony", "Żółty", "Zielony"]);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const categories = await Promise.all(
      incidentIds.map(
        async (id) =>
          responseData(await apiGet(client, `/api/incidents/${id}`))
            .llmCategory,
      ),
    );
    if (
      categories.every(
        (category) => typeof category === "string" && allowed.has(category),
      )
    )
      return;
    await Bun.sleep(1000);
  }
  throw new Error(
    `LLM did not classify all incidents within 120 seconds: ${incidentIds.join(", ")}`,
  );
}

async function databaseRows(sql: string): Promise<string[]> {
  const output = await command(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "database",
      "sh",
      "-c",
      'exec psql -X --set ON_ERROR_STOP=1 --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "$1"',
      "_",
      sql,
    ],
    true,
  );
  return output ? output.split("\n") : [];
}

async function storageKeys(incidentId: string): Promise<string[]> {
  const output = await compose(
    [
      "exec",
      "-T",
      "storage-1",
      "sh",
      "-c",
      'MC_CERTS_DIR=/root/.mc/certs SSL_CERT_FILE=/root/.mc/certs/CAs/ca.crt mc ls --recursive "minio/$S3_BUCKET/incidents/$1"',
      "_",
      incidentId,
    ],
    true,
  );
  return output ? output.split("\n").filter(Boolean) : [];
}

async function cleanupFixture(): Promise<void> {
  for (const incidentId of fixtureIncidentIds) {
    try {
      await compose(
        [
          "exec",
          "-T",
          "storage-1",
          "sh",
          "-c",
          'MC_CERTS_DIR=/root/.mc/certs SSL_CERT_FILE=/root/.mc/certs/CAs/ca.crt mc rm --recursive --force "minio/$S3_BUCKET/incidents/$1"',
          "_",
          incidentId,
        ],
        true,
      );
    } catch (error) {
      console.error(
        `${prefix} storage cleanup failed for ${incidentId}`,
        error,
      );
    }
  }
  const emails = Object.values(identities)
    .map(({ email }) => `'${email}'`)
    .join(", ");
  await databaseRows(
    `BEGIN; DELETE FROM organization WHERE slug IN ('${identities.adminA.organizationSlug}', '${identities.adminB.organizationSlug}'); DELETE FROM "user" WHERE email IN (${emails}); COMMIT;`,
  );
}

async function waitForPublicApi(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api`);
      if (response.ok) return;
    } catch {
      // NGINX may briefly retain the old backend address during recreation.
    }
    await Bun.sleep(250);
  }
  throw new Error("public API did not become ready after backend recreation");
}

async function runApiWorkflow(
  organizationAId: string,
  organizationBId: string,
): Promise<void> {
  const adminA = await signInAndAssertSession(
    identities.adminA.email,
    organizationAId,
  );
  const adminB = await signInAndAssertSession(
    identities.adminB.email,
    organizationBId,
  );

  const organizationsA = await listOrganizations(adminA);
  expectValue(
    organizationsA.some(
      (organization) => organization.id === organizationAId,
    ) &&
      !organizationsA.some(
        (organization) => organization.id === organizationBId,
      ),
    "admin A organization list has an invalid tenant scope",
  );
  const activeMemberA = await apiGet(
    adminA,
    "/api/auth/organization/get-active-member",
  );
  expectValue(
    activeMemberA.organizationId === organizationAId &&
      activeMemberA.role === "admin",
    "admin A active membership does not match the selected organization and role",
  );

  await addMember(adminA, identities.analystA1, "analityk");
  const analystA2MemberId = await addMember(
    adminA,
    identities.analystA2,
    "pracownik",
  );
  expectValue(
    memberByEmail(await listMembers(adminA), identities.analystA2.email)
      ?.role === "pracownik",
    "new member role is not visible in list-members",
  );
  await apiJson(adminA, "/api/auth/organization/update-member-role", "POST", {
    memberId: analystA2MemberId,
    role: "analityk",
  });
  expectValue(
    memberByEmail(await listMembers(adminA), identities.analystA2.email)
      ?.role === "analityk",
    "updated member role is not visible in list-members",
  );
  await addMember(adminA, identities.employeeA1, "pracownik");
  await addMember(adminA, identities.employeeA2, "pracownik");
  const analystBMemberId = await addMember(
    adminB,
    identities.analystB,
    "analityk",
  );
  await addMember(adminB, identities.employeeB, "pracownik");

  const removableMemberId = await addMember(
    adminA,
    identities.userNoOrg,
    "pracownik",
  );
  expectValue(
    memberByEmail(await listMembers(adminA), identities.userNoOrg.email)?.id ===
      removableMemberId,
    "added removable member is missing from list-members",
  );
  await apiJson(adminA, "/api/auth/organization/remove-member", "POST", {
    memberIdOrEmail: removableMemberId,
  });
  expectValue(
    !memberByEmail(await listMembers(adminA), identities.userNoOrg.email),
    "removed member is still visible in list-members",
  );
  const foreignOrg = await apiJson(
    adminA,
    "/api/auth/organization/add-member-by-email",
    "POST",
    {
      email: identities.userNoOrg.email,
      role: "pracownik",
      organizationId: organizationBId,
    },
    403,
  );
  await assertErrorCode(foreignOrg, "ORGANIZATION_ACCESS_DENIED");

  const [
    analystA1,
    analystA2,
    employeeA1,
    employeeA2,
    analystB,
    employeeB,
    noOrg,
  ] = await Promise.all([
    signInAndAssertSession(identities.analystA1.email, organizationAId),
    signInAndAssertSession(identities.analystA2.email, organizationAId),
    signInAndAssertSession(identities.employeeA1.email, organizationAId),
    signInAndAssertSession(identities.employeeA2.email, organizationAId),
    signInAndAssertSession(identities.analystB.email, organizationBId),
    signInAndAssertSession(identities.employeeB.email, organizationBId),
    signInAndAssertSession(identities.userNoOrg.email, null),
  ]);

  const forbiddenMembership = await apiJson(
    employeeA1,
    "/api/auth/organization/add-member-by-email",
    "POST",
    { email: identities.userNoOrg.email, role: "pracownik" },
    403,
  );
  await assertErrorCode(forbiddenMembership, "FORBIDDEN");

  await apiMutation4xx(
    employeeA1,
    "/api/auth/organization/update-member-role",
    "POST",
    { memberId: analystA2MemberId, role: "pracownik" },
  );
  await apiMutation4xx(
    employeeA1,
    "/api/auth/organization/remove-member",
    "POST",
    {
      memberIdOrEmail: analystA2MemberId,
    },
  );
  expectValue(
    memberByEmail(await listMembers(adminA), identities.analystA2.email)
      ?.role === "analityk",
    "employee changed or removed another member",
  );

  await apiMutation4xx(
    adminA,
    `/api/auth/organization/list-members?limit=100&organizationId=${organizationBId}`,
    "GET",
    undefined,
  );
  await apiMutation4xx(
    adminA,
    "/api/auth/organization/update-member-role",
    "POST",
    {
      memberId: analystBMemberId,
      role: "pracownik",
    },
  );
  await apiMutation4xx(adminA, "/api/auth/organization/remove-member", "POST", {
    memberIdOrEmail: identities.analystB.email,
  });
  expectValue(
    memberByEmail(await listMembers(adminB), identities.analystB.email)
      ?.role === "analityk",
    "admin A changed or removed a member of organization B",
  );

  await assertErrorCode(
    await apiGet(noOrg, "/api/incidents/my", 403),
    "NO_ORGANIZATION",
  );
  await assertErrorCode(
    await apiGet(noOrg, "/api/analyst/incidents/unassigned", 403),
    "NO_ORGANIZATION",
  );
  await assertErrorCode(
    await apiGet(noOrg, "/api/admin/analytics/stats", 403),
    "NO_ORGANIZATION",
  );

  const incidentA1 = await createIncident(
    employeeA1,
    `PHASE0 TENANT_A primary incident ${runId}: suspicious executable and credential theft.`,
    true,
  );
  const incidentA2 = await createIncident(
    employeeA2,
    `PHASE0 TENANT_A secondary incident ${runId}: harmless policy question.`,
  );
  const incidentB = await createIncident(
    employeeB,
    `PHASE0 TENANT_B secret incident ${runId}: phishing message received.`,
  );

  const noFileDetails = responseData(
    await apiGet(employeeA2, `/api/incidents/${incidentA2}`),
  );
  expectValue(
    noFileDetails.organizationId === organizationAId &&
      noFileDetails.status === "Zgłoszony" &&
      noFileDetails.userScreenshotPath === null &&
      noFileDetails.userAttachmentPath === null,
    "incident without files has invalid tenant, status or file paths",
  );
  const ownerRows = await databaseRows(
    `SELECT u.email || '|' || i."organizationId" FROM incidents i JOIN "user" u ON u.id = i."userId" WHERE i.id = '${incidentA2}';`,
  );
  expectValue(
    ownerRows[0] === `${identities.employeeA2.email}|${organizationAId}`,
    "incident owner or organization was not persisted",
  );

  const fileDetails = responseData(
    await apiGet(employeeA1, `/api/incidents/${incidentA1}`),
  );
  expectValue(
    typeof fileDetails.userScreenshotPath === "string" &&
      fileDetails.userScreenshotPath.startsWith(`incidents/${incidentA1}/`) &&
      typeof fileDetails.userAttachmentPath === "string" &&
      fileDetails.userAttachmentPath.startsWith(`incidents/${incidentA1}/`) &&
      (fileDetails.userScreenshotMetadata as JsonObject | undefined)
        ?.originalName === screenshotFilename &&
      (fileDetails.userAttachmentMetadata as JsonObject | undefined)
        ?.originalName === attachmentFilename,
    "incident file paths or PostgreSQL metadata are inconsistent",
  );
  expectValue(
    (await storageKeys(incidentA1)).length === 2,
    "screenshot and attachment were not both persisted in object storage",
  );

  const employeeA1List = await apiGet(employeeA1, "/api/incidents/my");
  const employeeA1Items = responseItems(employeeA1List);
  expectValue(
    hasIncident(employeeA1Items, incidentA1),
    "employee A1 cannot see own incident",
  );
  expectValue(
    !hasIncident(employeeA1Items, incidentA2),
    "employee A1 can see employee A2 incident",
  );
  expectValue(
    !hasIncident(employeeA1Items, incidentB),
    "employee A1 can see tenant B incident",
  );
  expectValue(
    (employeeA1List.pagination as JsonObject | undefined)?.total === 1 &&
      !JSON.stringify(employeeA1List).includes("PHASE0 TENANT_B secret"),
    "employee A1 pagination or payload leaks another owner or tenant",
  );
  for (const [label, client, pathname] of [
    ["author", employeeA1, `/api/incidents/${incidentA1}`],
    ["analyst", analystA1, `/api/analyst/incidents/${incidentA1}`],
    ["admin", adminA, `/api/admin/incidents/${incidentA1}`],
  ] as const) {
    expectValue(
      responseData(await apiGet(client, pathname)).id === incidentA1,
      `${label} cannot read incident details in organization A`,
    );
  }
  await assertErrorCode(
    await apiGet(employeeA2, `/api/incidents/${incidentA1}`, 404),
    "NOT_FOUND",
  );
  await assertErrorCode(
    await apiGet(employeeB, `/api/incidents/${incidentA1}`, 404),
    "NOT_FOUND",
  );
  await assertErrorCode(
    await apiGet(adminB, `/api/admin/incidents/${incidentA1}`, 404),
    "INCIDENT_NOT_FOUND",
  );

  const unassignedA = responseItems(
    await apiGet(analystA1, "/api/analyst/incidents/unassigned"),
  );
  expectValue(
    hasIncident(unassignedA, incidentA1),
    "analyst A cannot see tenant A primary incident",
  );
  expectValue(
    hasIncident(unassignedA, incidentA2),
    "analyst A cannot see tenant A secondary incident",
  );
  expectValue(
    !hasIncident(unassignedA, incidentB),
    "analyst A can see tenant B incident",
  );
  const unassignedB = responseItems(
    await apiGet(analystB, "/api/analyst/incidents/unassigned"),
  );
  expectValue(
    hasIncident(unassignedB, incidentB),
    "analyst B cannot see tenant B incident",
  );
  expectValue(
    !hasIncident(unassignedB, incidentA1),
    "analyst B can see tenant A incident",
  );

  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/assign`,
    "POST",
    undefined,
  );
  const assignedBeforeConflict = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  await assertErrorCode(
    await apiJson(
      analystA2,
      `/api/analyst/incidents/${incidentA1}/assign`,
      "POST",
      undefined,
      409,
    ),
    "INCIDENT_ALREADY_ASSIGNED",
  );
  const assignedAfterConflict = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  expectValue(
    assignedAfterConflict.analystId === assignedBeforeConflict.analystId &&
      assignedAfterConflict.status === assignedBeforeConflict.status,
    "rejected competing assignment changed owner or status",
  );
  const nonexistentIncident = crypto.randomUUID();
  const foreignDetails = await apiGet(
    analystB,
    `/api/analyst/incidents/${incidentA1}`,
    404,
  );
  const nonexistentDetails = await apiGet(
    analystB,
    `/api/analyst/incidents/${nonexistentIncident}`,
    404,
  );
  expectValue(
    JSON.stringify(foreignDetails) === JSON.stringify(nonexistentDetails),
    "cross-tenant details are distinguishable from a nonexistent incident",
  );
  await assertErrorCode(
    await apiJson(
      analystB,
      `/api/analyst/incidents/${incidentA1}/assign`,
      "POST",
      undefined,
      404,
    ),
    "INCIDENT_NOT_FOUND",
  );
  const foreignUnassign = await apiJson(
    analystB,
    `/api/analyst/incidents/${incidentA1}/unassign`,
    "POST",
    undefined,
    404,
  );
  const nonexistentUnassign = await apiJson(
    analystB,
    `/api/analyst/incidents/${nonexistentIncident}/unassign`,
    "POST",
    undefined,
    404,
  );
  expectValue(
    JSON.stringify(foreignUnassign) === JSON.stringify(nonexistentUnassign),
    "cross-tenant unassign is distinguishable from a nonexistent incident",
  );
  const assignedA1 = responseItems(
    await apiGet(analystA1, "/api/analyst/incidents/assigned"),
  );
  expectValue(
    hasIncident(assignedA1, incidentA1),
    "assigned incident missing from analyst queue",
  );

  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA2}/assign`,
    "POST",
    undefined,
  );
  await assertErrorCode(
    await apiJson(
      analystA2,
      `/api/analyst/incidents/${incidentA2}/unassign`,
      "POST",
      undefined,
      403,
    ),
    "CANNOT_UNASSIGN_INCIDENT",
  );
  const unassigned = responseData(
    await apiJson(
      analystA1,
      `/api/analyst/incidents/${incidentA2}/unassign`,
      "POST",
      undefined,
    ),
  );
  expectValue(
    unassigned.analystId === null && unassigned.status === "Zgłoszony",
    "owner unassign did not clear analyst and restore initial status",
  );
  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA2}/assign`,
    "POST",
    undefined,
  );
  const resolved = responseData(
    await apiJson(
      analystA1,
      `/api/analyst/incidents/${incidentA2}/resolve`,
      "PUT",
      undefined,
    ),
  );
  expectValue(
    resolved.czyRozwiazany === true &&
      typeof resolved.dataRozwiazania === "string",
    "resolve did not return resolution state and timestamp",
  );
  const resolvedDetails = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA2}`),
  );
  expectValue(
    resolvedDetails.czyRozwiazany === true &&
      typeof resolvedDetails.dataRozwiazania === "string",
    "resolved state was not persisted",
  );
  await assertErrorCode(
    await apiJson(
      analystA1,
      `/api/analyst/incidents/${incidentA2}/resolve`,
      "PUT",
      undefined,
      400,
    ),
    "ALREADY_RESOLVED",
  );

  const protectedBefore = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  const auditCountBeforeForbidden = Number(
    (
      await databaseRows(
        `SELECT count(*) FROM incident_audit_log WHERE "incidentId" = '${incidentA1}';`,
      )
    )[0],
  );
  await assertErrorCode(
    await apiJson(
      analystA2,
      `/api/analyst/incidents/${incidentA1}/status`,
      "PUT",
      { status: "Raport złożony" },
      403,
    ),
    "CANNOT_MODIFY_STATUS",
  );
  await assertErrorCode(
    await apiJson(
      analystA2,
      `/api/analyst/incidents/${incidentA1}/notes`,
      "PUT",
      { notes: "must be rejected" },
      403,
    ),
    "CANNOT_MODIFY_NOTES",
  );
  for (const [operation, body] of [
    ["status", { status: "Raport złożony" }],
    ["notes", { notes: "tenant B must be rejected" }],
  ] as const) {
    await assertErrorCode(
      await apiJson(
        analystB,
        `/api/analyst/incidents/${incidentA1}/${operation}`,
        "PUT",
        body,
        404,
      ),
      "INCIDENT_NOT_FOUND",
    );
  }
  const protectedAfter = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  const auditCountAfterForbidden = Number(
    (
      await databaseRows(
        `SELECT count(*) FROM incident_audit_log WHERE "incidentId" = '${incidentA1}';`,
      )
    )[0],
  );
  expectValue(
    protectedAfter.status === protectedBefore.status &&
      protectedAfter.analystNote === protectedBefore.analystNote &&
      protectedAfter.updatedAt === protectedBefore.updatedAt &&
      auditCountAfterForbidden === auditCountBeforeForbidden,
    "rejected status/note mutations changed incident data or audit",
  );

  await Bun.sleep(10);
  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/status`,
    "PUT",
    { status: "Raport złożony" },
  );
  const analystNote = `Phase 0 analyst note ${runId}`;
  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/notes`,
    "PUT",
    { notes: analystNote },
  );
  const changedDetails = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  expectValue(
    changedDetails.status === "Raport złożony" &&
      changedDetails.analystNote === analystNote &&
      Date.parse(String(changedDetails.updatedAt)) >
        Date.parse(String(protectedBefore.updatedAt)),
    "owner status/note changes were not persisted with a newer updatedAt",
  );
  const auditAfterStatus = await databaseRows(
    `SELECT "newStatus" FROM incident_audit_log WHERE "incidentId" = '${incidentA1}' AND "newStatus" = 'Raport złożony';`,
  );
  expectValue(
    auditAfterStatus.length >= 1,
    "status change did not create an audit row",
  );

  const reportFilename = `phase0-report-${runId}.pdf`;
  const statementFilename = `phase0-statement-${runId}.docx`;
  const reportBytes = new TextEncoder().encode(
    `%PDF-1.4\nPhase 0 ${runId}\n%%EOF\n`,
  );
  const statementBytes = Uint8Array.from([
    0x50, 0x4b, 0x03, 0x04, 0x50, 0x48, 0x41, 0x53, 0x45, 0x30,
  ]);
  const invalidReports = [
    {},
    {
      reportData: {
        filename: "invalid.pdf",
        data: "%%%not-base64%%%",
        mimeType: "application/pdf",
      },
    },
    {
      reportData: {
        filename: "invalid.html",
        data: Buffer.from("<html></html>").toString("base64"),
        mimeType: "text/html",
      },
    },
    {
      reportData: {
        filename: "../unsafe.pdf",
        data: Buffer.from("%PDF-1.4\nunsafe").toString("base64"),
        mimeType: "application/pdf",
      },
    },
  ];
  for (const invalidReport of invalidReports) {
    await apiMutation4xx(
      analystA1,
      `/api/analyst/incidents/${incidentA1}/reports`,
      "POST",
      invalidReport,
    );
  }
  const oversizedEncoded = Buffer.alloc(50 * 1024 * 1024 + 1, 0x25).toString(
    "base64",
  );
  await apiMutation4xx(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/reports`,
    "POST",
    {
      reportData: {
        filename: "too-large.pdf",
        data: oversizedEncoded,
        mimeType: "application/pdf",
      },
    },
  );
  const afterInvalidUploads = responseData(
    await apiGet(analystA1, `/api/analyst/incidents/${incidentA1}`),
  );
  expectValue(
    afterInvalidUploads.status === "Raport złożony" &&
      afterInvalidUploads.analystReportPath === null &&
      (await storageKeys(incidentA1)).length === 2,
    "invalid report upload changed the incident or object storage",
  );
  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/reports`,
    "POST",
    {
      reportData: {
        filename: reportFilename,
        data: Buffer.from(reportBytes).toString("base64"),
        mimeType: "application/pdf",
      },
    },
  );
  await apiJson(
    analystA1,
    `/api/analyst/incidents/${incidentA1}/statements`,
    "POST",
    {
      statementData: {
        filename: statementFilename,
        data: Buffer.from(statementBytes).toString("base64"),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    },
  );

  for (const [label, client, routePrefix] of [
    ["analyst", analystA1, "/api/analyst"],
    ["employee", employeeA1, "/api"],
    ["admin", adminA, "/api/admin"],
  ] as const) {
    await assertDownload(
      client,
      `${routePrefix}/incidents/${incidentA1}/files/screenshots/${screenshotFilename}`,
      screenshotBytes,
      "image/png",
      screenshotFilename,
      `${label} screenshot`,
    );
    await assertDownload(
      client,
      `${routePrefix}/incidents/${incidentA1}/files/attachments/${attachmentFilename}`,
      attachmentBytes,
      "text/plain",
      attachmentFilename,
      `${label} attachment`,
    );
    await assertDownload(
      client,
      `${routePrefix}/incidents/${incidentA1}/files/reports/${reportFilename}`,
      reportBytes,
      "application/pdf",
      reportFilename,
      `${label} report`,
    );
    await assertDownload(
      client,
      `${routePrefix}/incidents/${incidentA1}/files/statements/${statementFilename}`,
      statementBytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      statementFilename,
      `${label} statement`,
    );
  }
  await assertDownload(
    analystA2,
    `/api/analyst/incidents/${incidentA1}/files/reports/${reportFilename}`,
    reportBytes,
    "application/pdf",
    reportFilename,
    "second organization A analyst report",
  );
  await assertErrorCode(
    await apiGet(
      employeeA2,
      `/api/incidents/${incidentA1}/files/reports/${reportFilename}`,
      404,
    ),
    "INCIDENT_NOT_FOUND",
  );
  await assertErrorCode(
    await apiGet(
      analystB,
      `/api/analyst/incidents/${incidentA1}/files/reports/${reportFilename}`,
      404,
    ),
    "INCIDENT_NOT_FOUND",
  );
  await assertErrorCode(
    await apiGet(
      employeeB,
      `/api/incidents/${incidentA1}/files/reports/${reportFilename}`,
      404,
    ),
    "INCIDENT_NOT_FOUND",
  );
  await assertErrorCode(
    await apiGet(
      adminB,
      `/api/admin/incidents/${incidentA1}/files/reports/${reportFilename}`,
      404,
    ),
    "INCIDENT_NOT_FOUND",
  );

  await waitForLlmCategories(adminA, [incidentA1, incidentA2]);
  await waitForLlmCategories(adminB, [incidentB]);
  await databaseRows(
    `UPDATE incidents SET "createdAt" = date_trunc('second', now()), "dataZgloszenia" = date_trunc('second', now()) WHERE id IN ('${incidentA1}', '${incidentA2}');`,
  );

  const adminQuery = {
    pagination: { page: 1, limit: 20 },
    filters: { assignment: "all" },
    sort: [{ field: "createdAt", direction: "desc" }],
  };
  const adminList = await apiJson(
    adminA,
    "/api/admin/incidents",
    "QUERY",
    adminQuery,
  );
  const adminItems = responseItems(adminList);
  expectValue(
    hasIncident(adminItems, incidentA1),
    "admin A list misses tenant A primary incident",
  );
  expectValue(
    hasIncident(adminItems, incidentA2),
    "admin A list misses tenant A secondary incident",
  );
  expectValue(
    !hasIncident(adminItems, incidentB),
    "admin A list contains tenant B incident",
  );
  expectValue(
    (adminList.pagination as JsonObject | undefined)?.total === 2,
    "admin A total is not 2",
  );

  const sortedIncidentIds = [incidentA1, incidentA2].sort();
  for (const page of [1, 2]) {
    const pageResult = await apiJson(adminA, "/api/admin/incidents", "QUERY", {
      pagination: { page, limit: 1 },
      filters: { assignment: "all" },
      sort: [{ field: "createdAt", direction: "asc" }],
    });
    expectValue(
      responseItems(pageResult)[0]?.id === sortedIncidentIds[page - 1] &&
        (pageResult.pagination as JsonObject | undefined)?.total === 2,
      `admin pagination page ${page} is unstable or has an invalid total`,
    );
  }
  const filteredList = await apiJson(adminA, "/api/admin/incidents", "QUERY", {
    pagination: { page: 1, limit: 20 },
    filters: {
      assignment: "assigned",
      resolved: true,
      search: identities.employeeA2.name,
    },
    sort: [{ field: "createdAt", direction: "desc" }],
  });
  expectValue(
    responseItems(filteredList).length === 1 &&
      responseItems(filteredList)[0]?.id === incidentA2 &&
      (filteredList.pagination as JsonObject | undefined)?.total === 1,
    "admin filters returned an invalid incident set",
  );
  const filters = responseData(
    await apiGet(adminA, "/api/admin/incidents/filters"),
  );
  expectValue(
    JSON.stringify(filters).includes(identities.analystA1.email) &&
      !JSON.stringify(filters).includes(identities.analystB.email),
    "admin filter options have an invalid tenant scope",
  );

  const stats = responseData(
    await apiGet(adminA, "/api/admin/analytics/stats"),
  );
  expectValue(
    stats.totalIncidents === 2 &&
      stats.resolvedIncidents === 1 &&
      Array.isArray(stats.statusBreakdown) &&
      Array.isArray(stats.categoryBreakdown) &&
      (stats.categoryBreakdown as JsonObject[]).reduce(
        (total, item) => total + Number(item.count),
        0,
      ) === 2 &&
      stats.avgResolutionTime !== null,
    "admin A stats, categories or resolution times are incomplete or cross-tenant",
  );
  const allMetrics = responseData(
    await apiJson(adminA, "/api/admin/analytics/metrics", "QUERY", {
      range: { lastDays: 30 },
      timezone: "Europe/Warsaw",
      groupBy: "day",
      filters: {},
      metrics: [
        "incidentsCreated",
        "incidentsResolved",
        "averageResolutionTime",
        "topUsers",
        "topAnalysts",
      ],
    }),
  );
  expectValue(
    !JSON.stringify(allMetrics).includes(identities.employeeB.email) &&
      Array.isArray((allMetrics.timeSeries as JsonObject).incidentsCreated) &&
      Array.isArray((allMetrics.timeSeries as JsonObject).incidentsResolved) &&
      Array.isArray(
        (allMetrics.timeSeries as JsonObject).avgResolutionTimeHours,
      ) &&
      Array.isArray(allMetrics.topUsers) &&
      Array.isArray(allMetrics.topAnalysts),
    "admin metrics are incomplete or leak tenant B",
  );
  const singleMetric = responseData(
    await apiJson(adminA, "/api/admin/analytics/metrics", "QUERY", {
      range: { lastDays: 30 },
      timezone: "Europe/Warsaw",
      groupBy: "day",
      filters: {},
      metrics: ["incidentsCreated"],
    }),
  );
  expectValue(
    ((singleMetric.timeSeries as JsonObject).incidentsCreated as unknown[])
      .length > 0 &&
      ((singleMetric.timeSeries as JsonObject).incidentsResolved as unknown[])
        .length === 0 &&
      (
        (singleMetric.timeSeries as JsonObject)
          .avgResolutionTimeHours as unknown[]
      ).length === 0 &&
      (singleMetric.topUsers as unknown[]).length === 0 &&
      (singleMetric.topAnalysts as unknown[]).length === 0,
    "single metric query returned unselected metrics",
  );

  for (const client of [analystA1, employeeA1]) {
    await assertErrorCode(
      await apiGet(client, "/api/admin/incidents/filters", 403),
      "FORBIDDEN",
    );
    await assertErrorCode(
      await apiGet(client, "/api/admin/analytics/stats", 403),
      "FORBIDDEN",
    );
    await assertErrorCode(
      await apiJson(client, "/api/admin/incidents", "QUERY", adminQuery, 403),
      "FORBIDDEN",
    );
    await assertErrorCode(
      await apiJson(
        client,
        "/api/admin/analytics/metrics",
        "QUERY",
        {
          range: { lastDays: 30 },
          timezone: "Europe/Warsaw",
          groupBy: "day",
          filters: {},
          metrics: ["incidentsCreated"],
        },
        403,
      ),
      "FORBIDDEN",
    );
  }
  const adminBList = await apiJson(
    adminB,
    "/api/admin/incidents",
    "QUERY",
    adminQuery,
  );
  expectValue(
    responseItems(adminBList).length === 1 &&
      responseItems(adminBList)[0]?.id === incidentB &&
      !JSON.stringify(adminBList).includes("TENANT_A"),
    "admin B list includes organization A",
  );
  const adminBStats = responseData(
    await apiGet(adminB, "/api/admin/analytics/stats"),
  );
  expectValue(
    adminBStats.totalIncidents === 1,
    "admin B aggregate includes organization A",
  );

  const auditRows = await databaseRows(
    `SELECT "oldStatus" || '|' || "newStatus" FROM incident_audit_log WHERE "incidentId" = '${incidentA1}' ORDER BY "changedAt";`,
  );
  expectValue(
    auditRows.length >= 3,
    `expected at least 3 audit transitions, got ${auditRows.length}`,
  );
  expectValue(
    auditRows.some((row) => row.endsWith("|Raport w trakcie")),
    "assignment audit missing",
  );
  expectValue(
    auditRows.some((row) => row.endsWith("|Raport złożony")),
    "report audit missing",
  );
  expectValue(
    auditRows.some((row) => row.endsWith("|Sprawozdanie złożone")),
    "statement audit missing",
  );

  await compose(["stop", "llm_service"], true);
  const degradedIncident = await createIncident(
    employeeA1,
    `PHASE0 degraded LLM incident ${runId}: service unavailable must not lose this record.`,
  );
  await Bun.sleep(1500);
  const degradedDetails = responseData(
    await apiGet(employeeA1, `/api/incidents/${degradedIncident}`),
  );
  expectValue(
    degradedDetails.id === degradedIncident &&
      degradedDetails.llmCategory === null &&
      degradedDetails.userDescription ===
        `PHASE0 degraded LLM incident ${runId}: service unavailable must not lose this record.`,
    "unavailable LLM lost the incident or persisted an invalid category",
  );
  await compose(["up", "-d", "--wait", "--wait-timeout", "180", "llm_service"]);
}

let switchedBackend = false;
try {
  console.log(`${prefix} starting isolated SMTP capture`);
  switchedBackend = true;
  await compose([
    "up",
    "-d",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
    "smtp-test",
    "backend",
  ]);
  await compose(["restart", "nginx"], true);
  await waitForPublicApi();
  const portOutput = await compose(["port", "smtp-test", "8025"], true);
  const mailpitPort = portOutput.match(/:(\d+)$/)?.[1];
  if (!mailpitPort)
    throw new Error(`could not resolve Mailpit port from: ${portOutput}`);
  const mailpitUrl = `http://127.0.0.1:${mailpitPort}`;

  const adminAJar = await registerAdmin(identities.adminA);
  const adminBJar = await registerAdmin(identities.adminB);
  await assertDuplicateOrganizationSlugRejected();
  const standardIdentities = [
    identities.analystA1,
    identities.analystA2,
    identities.employeeA1,
    identities.employeeA2,
    identities.analystB,
    identities.employeeB,
    identities.userNoOrg,
    identities.userUnverified,
  ];
  const standardJars = new Map<string, CookieJar>();
  for (const identity of standardIdentities) {
    standardJars.set(identity.email, await registerUser(identity));
  }

  const verifiedAccounts = [
    [identities.adminA, adminAJar],
    [identities.adminB, adminBJar],
    ...standardIdentities
      .filter(({ email }) => email !== identities.userUnverified.email)
      .map(
        (identity) => [identity, standardJars.get(identity.email)!] as const,
      ),
  ] as const;
  await Promise.all(
    verifiedAccounts.map(([identity, jar]) =>
      verifyEmail(mailpitUrl, identity.email, jar),
    ),
  );

  const noOrgVerificationJar = standardJars.get(identities.userNoOrg.email)!;
  const autoSession = await jsonRequest(
    "/api/auth/get-session",
    { method: "GET" },
    noOrgVerificationJar,
    200,
  );
  expectValue(
    (autoSession.user as JsonObject | undefined)?.email ===
      identities.userNoOrg.email,
    "email verification did not create the configured automatic session",
  );
  await assertWrongPasswordRejected(
    identities.adminA.email,
    `Wrong-${crypto.randomUUID()}-9!`,
  );
  await resetPasswordThroughMailpit(mailpitUrl, identities.userNoOrg.email);
  await assertLogoutInvalidatesSession(identities.userNoOrg.email);

  const unverifiedJar = standardJars.get(identities.userUnverified.email)!;
  await assertErrorCode(
    await apiGet(
      { jar: unverifiedJar, csrfToken: await csrf(unverifiedJar) },
      "/api/incidents/my",
      401,
    ),
    "UNAUTHORIZED",
  );

  const organizationRows = await databaseRows(
    `SELECT slug || '|' || id FROM organization WHERE slug IN ('${identities.adminA.organizationSlug}', '${identities.adminB.organizationSlug}') ORDER BY slug;`,
  );
  const organizationIds = new Map(
    organizationRows.map((row) => row.split("|") as [string, string]),
  );
  const organizationAId = organizationIds.get(
    identities.adminA.organizationSlug,
  );
  const organizationBId = organizationIds.get(
    identities.adminB.organizationSlug,
  );
  expectValue(
    organizationAId && organizationBId,
    "fixture organizations are missing",
  );

  await runApiWorkflow(organizationAId, organizationBId);

  const rows = await databaseRows(
    `SELECT u.email || '|' || u."emailVerified" || '|' || COALESCE(m.role, '-') || '|' || COALESCE(m."organizationId", '-') FROM "user" u LEFT JOIN member m ON m."userId" = u.id WHERE u.email LIKE '%-${runId}@phase0.invalid' ORDER BY u.email;`,
  );
  expectValue(
    rows.length === 10,
    `expected 10 fixture identities, got ${rows.length}`,
  );
  expectValue(
    rows.filter((row) => row.includes("|true|")).length === 9,
    "fixture should contain exactly 9 verified users",
  );
  expectValue(
    rows.includes(`${identities.userNoOrg.email}|true|-|-`),
    "USER_NO_ORG unexpectedly belongs to an organization",
  );
  expectValue(
    rows.includes(`${identities.userUnverified.email}|false|-|-`),
    "USER_UNVERIFIED has an invalid verification or organization state",
  );

  console.log(
    `${prefix} PASS: complete role fixture, tenant isolation, incident workflow, files, audit, analytics and LLM`,
  );
} catch (error) {
  try {
    const logs = await compose(
      ["logs", "--no-color", "--tail", "100", "backend"],
      true,
    );
    console.error(`${prefix} backend diagnostics:\n${logs}`);
  } catch {
    console.error(`${prefix} backend diagnostics unavailable`);
  }
  throw error;
} finally {
  try {
    await cleanupFixture();
  } catch (error) {
    console.error(`${prefix} fixture cleanup failed`, error);
  }
  if (switchedBackend) {
    try {
      await command(
        "docker",
        [
          "compose",
          "up",
          "-d",
          "--force-recreate",
          "--wait",
          "--wait-timeout",
          "180",
          "backend",
        ],
        true,
      );
      await command("docker", ["compose", "restart", "nginx"], true);
      await compose(["rm", "--stop", "--force", "smtp-test"], true);
    } catch (error) {
      console.error(`${prefix} stack restoration failed`, error);
    }
  }
}
