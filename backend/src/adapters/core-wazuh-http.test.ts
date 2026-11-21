import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:https";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { coreWazuhRoutes } from "./core-wazuh-http";
import { keepAliveMs, wazuhIndexer, type Sort } from "./wazuh-indexer";
import { createCoreApplication } from "../core/application";
import type { LiveIdentity } from "../identity/contract";
import { wazuhRefreshSeconds } from "../wazuh/config";
import { indexerAddress, indexerTransport } from "../wazuh/network";
import { wazuhService } from "../wazuh/service";
import { WazuhError, type Source, type SourceConnection } from "../wazuh/source";

const key = randomBytes(32);
const origin = "https://indexer.example.test";
const password = "test-password";
const org = "org";
const agent = { id: "001", name: "ubuntu" };
const timestamp = new Date().toISOString();
const source = {
	timestamp,
	agent,
	rule: { id: "510", level: 7, description: "Test" },
	privatePayload: { active: true },
};
const records = Array.from({ length: 71 }, (_, index) => {
	const indexName = index < 50 ? "wazuh-alerts-fixture-a" : "wazuh-alerts-fixture-b";
	const id = String(index % 50).padStart(2, "0");
	return {
		_index: indexName,
		_id: id,
		_source: { ...source, rule: { ...source.rule, level: index === 70 ? 8 : 7 } },
		sort: [Date.parse(timestamp), indexName, id] as Sort,
	};
});
const scopes = new Map<string, Source>();
let directory: string;
const savedKey = process.env.WAZUH_SOURCE_KEY_FILE;
beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "wazuh-tests-"));
	process.env.WAZUH_SOURCE_KEY_FILE = join(directory, "key");
	await writeFile(process.env.WAZUH_SOURCE_KEY_FILE, key.toString("base64"), { mode: 0o600 });
});
afterAll(async () => {
	if (savedKey === undefined) delete process.env.WAZUH_SOURCE_KEY_FILE;
	else process.env.WAZUH_SOURCE_KEY_FILE = savedKey;
	await rm(directory, { recursive: true, force: true });
});

const store = {
	async get(org: string) {
		return scopes.get(org);
	},
	async save(
		org: string,
		{ origin, username, password, ca }: SourceConnection,
		expected?: string,
	) {
		if (scopes.get(org)?.revision !== expected) throw new WazuhError("STALE");
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", key, iv);
		cipher.setAAD(Buffer.from(JSON.stringify(["bastiondesk-wazuh-v1", org, origin, username])));
		const data = Buffer.concat([cipher.update(password), cipher.final()]);
		const value = {
			organization_id: org,
			origin,
			username,
			ca_pem: ca ?? null,
			encrypted_password: Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64"),
			revision: crypto.randomUUID(),
			enabled: true,
		};
		scopes.set(org, value);
		return value;
	},
	async setEnabled(org: string, expected: string, enabled: boolean) {
		if (scopes.get(org)?.revision !== expected) throw new WazuhError("STALE");
		const value = { ...scopes.get(org)!, enabled, revision: crypto.randomUUID() };
		scopes.set(org, value);
		return value;
	},
	async remove(org: string, expected: string) {
		if (scopes.get(org)?.revision !== expected) throw new WazuhError("STALE");
		scopes.delete(org);
	},
};

test("WAZ-01–07 authorization, lifecycle, stable pagination, JSON, and failure recovery", async () => {
	type SearchBody = {
		size?: number;
		_source?: unknown;
		pit?: { id: string };
		search_after?: Sort;
		sort?: object[];
		query?: {
			bool?: {
				filter: {
					range?: { timestamp: { gte: string; lte: string } };
					term?: { "rule.level": number };
				}[];
			};
			ids?: { values: string[] };
		};
	};
	const snapshots = new Map<string, typeof records>();
	const queries: SearchBody[] = [];
	let failure: WazuhError["code"] | undefined;
	let partial = false;
	let retained = true;
	let empty = true;
	let hasIndex = false;
	let canCreatePit = true;
	let canClosePit = true;
	let abortVerification: AbortController | undefined;
	const verificationSignals = new Set<AbortSignal>();
	let documentRead: ReturnType<typeof Promise.withResolvers<AbortSignal>> | undefined;
	let identity: LiveIdentity | null = null;
	const service = wazuhService(store, 60, (connection) =>
		wazuhIndexer(connection, async (method, path, data, signal) => {
			if (abortVerification && signal) verificationSignals.add(signal);
			if (failure) throw new WazuhError(failure);
			if (connection.password !== password) throw new WazuhError("AUTHENTICATION");
			const body = data as SearchBody | undefined;
			if (method === "DELETE") {
				const pits = (data as { pit_id: string[] }).pit_id.map((id) => {
					if (canClosePit) snapshots.delete(id);
					return { successful: canClosePit, pit_id: id };
				});
				abortVerification?.abort();
				return { pits };
			}
			if (path.includes("point_in_time")) {
				if (!hasIndex) throw new WazuhError("NOT_FOUND");
				if (!canCreatePit) throw new WazuhError("PERMISSION");
				const id = crypto.randomUUID();
				snapshots.set(id, empty ? [] : records.slice());
				return { pit_id: id };
			}
			const response = (hits: object[]) => ({
				timed_out: false,
				_shards: { total: hasIndex ? 1 : 0, failed: partial ? 1 : 0 },
				hits: { hits },
			});
			if (!body) throw new Error("Expected a search body");
			if (body._source === false) return response([]);
			if (body.query?.ids) {
				if (documentRead) {
					if (!signal) throw new Error("Expected the document request signal");
					const disconnected = once(signal, "abort");
					documentRead.resolve(signal);
					await disconnected;
					throw new WazuhError("TIMEOUT");
				}
				const hit = records.find(
					(record) =>
						record._id === body.query?.ids?.values[0] &&
						path.startsWith("/" + record._index + "/"),
				);
				return response(hit && retained ? [hit] : []);
			}
			queries.push(body);
			const range = body.query?.bool?.filter[0]?.range?.timestamp;
			const level = body.query?.bool?.filter[1]?.term?.["rule.level"];
			const frozen = snapshots.get(body.pit!.id)!;
			const offset = body.search_after
				? frozen.findIndex(
						(row) => JSON.stringify(row.sort) === JSON.stringify(body.search_after),
					) + 1
				: 0;
			return response(
				frozen
					.slice(offset)
					.filter(
						(row) =>
							(!range ||
								(Date.parse(range.gte) <= row.sort[0] &&
									Date.parse(range.lte) >= row.sort[0])) &&
							(level === undefined || row._source.rule.level === level),
					)
					.slice(0, body.size),
			);
		}),
	);
	const app = await createCoreApplication(
		coreWazuhRoutes({ read: async () => identity }, service),
	);
	const server = express().use(express.json(), app.http).listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Expected TCP listener");
		const url = "http://127.0.0.1:" + address.port + "/api/wazuh/";
		const send = (
			path: string,
			method = "GET",
			payload?: unknown,
			organizationId = org,
			params = {},
			signal?: AbortSignal,
		) =>
			fetch(url + path + "?" + new URLSearchParams({ organizationId, ...params }), {
				method,
				signal,
				...(payload !== undefined && {
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
				}),
			});
		const get = async (path: string, params = {}, organizationId = org) => {
			const response = await send(path, "GET", undefined, organizationId, params);
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			return ((await response.json()) as { data: any }).data;
		};
		const signIn = (
			role: LiveIdentity["role"],
			organizationId = org,
			sessionId = "session",
		) => {
			identity = {
				subject: "user",
				sessionId,
				organizationId,
				role,
				sessionExpiresAt: Math.floor(Date.now() / 1000) + 60,
			};
		};
		expect((await send("source")).status).toBe(401);
		signIn("admin");
		const config = { origin, username: "readonly", password, revision: null };
		expect((await send("source/check", "POST", config)).status).toBe(200);
		expect((await get("source")).source).toBeNull();
		hasIndex = true;
		canCreatePit = false;
		for (const [path, method] of [
			["source/check", "POST"],
			["source", "PUT"],
		]) {
			const response = await send(path!, method, config);
			expect(response.status).toBe(502);
			expect(await response.json()).toMatchObject({ error: { code: "WAZUH_PERMISSION" } });
		}
		expect((await get("source")).source).toBeNull();
		canCreatePit = true;
		canClosePit = false;
		expect((await send("source", "PUT", config)).status).toBe(502);
		expect((await get("source")).source).toBeNull();
		canClosePit = true;
		snapshots.clear();
		abortVerification = new AbortController();
		const timeout = spyOn(AbortSignal, "timeout").mockReturnValueOnce(abortVerification.signal);
		try {
			const response = await send("source", "PUT", config);
			expect(response.status).toBe(504);
			expect(await response.json()).toMatchObject({ error: { code: "WAZUH_TIMEOUT" } });
			expect((await get("source")).source).toBeNull();
			expect(verificationSignals.size).toBe(1);
			expect(timeout).toHaveBeenCalledWith(10_000);
		} finally {
			timeout.mockRestore();
			abortVerification = undefined;
		}
		expect((await send("source", "PUT", config)).status).toBe(200);
		const saved = await get("source");
		expect(saved.refreshSeconds).toBe(60);
		expect(JSON.stringify(saved)).not.toContain(password);
		expect(scopes.get(org)?.encrypted_password).not.toContain(password);
		const { revision } = saved.source;
		expect((await get("alerts", { revision })).alerts).toEqual([]);
		hasIndex = false;
		expect((await get("alerts", { revision })).alerts).toEqual([]);
		hasIndex = true;
		const savedConfig = { ...config, revision };

		empty = false;
		const current = await get("alerts", { revision });
		expect(current.alerts).toHaveLength(50);
		expect(current.alerts[0].agentName).toBe(agent.name);
		expect(current.alerts[0]).not.toHaveProperty("privatePayload");
		const range = queries.at(-1)?.query?.bool?.filter[0]?.range?.timestamp;
		expect(Date.parse(range!.lte) - Date.parse(range!.gte)).toBe(86_400_000);
		const view = crypto.randomUUID();
		const otherView = crypto.randomUUID();
		const beforeRefresh = await get("alerts", { revision, view });
		const independent = await get("alerts", { revision, view: otherView });
		const openCount = snapshots.size;
		await Promise.all([get("alerts", { revision, view }), get("alerts", { revision, view })]);
		expect(snapshots.size).toBe(openCount);
		expect(
			(
				await send("alerts", "GET", undefined, org, {
					revision,
					view,
					cursor: beforeRefresh.nextCursor,
				})
			).status,
		).toBe(409);
		expect(
			(await get("alerts", { revision, view: otherView, cursor: independent.nextCursor }))
				.alerts,
		).toHaveLength(21);
		const historical = {
			from: new Date(Date.parse(timestamp) - 60_000).toISOString(),
			to: new Date(Date.parse(timestamp) + 60_000).toISOString(),
			level: "7",
			revision,
		};
		const first = await get("alerts", historical);
		const next = await get("alerts", { ...historical, cursor: first.nextCursor });
		for (const query of queries.slice(-2))
			expect(query.sort).toEqual([{ timestamp: "desc" }, { _index: "asc" }, { _id: "asc" }]);
		const keys = [...first.alerts, ...next.alerts].map(
			({ indexName, documentId }) => indexName + "/" + documentId,
		);
		expect(new Set(keys).size).toBe(70);
		expect(next.nextCursor).toBeNull();
		expect(first.alerts.every((row: { ruleLevel: number }) => row.ruleLevel === 7)).toBe(true);
		const doc = { revision, indexName: records[0]!._index, documentId: records[0]!._id };
		expect((await get("alerts/detail", doc)).agentId).toBe("001");
		expect((await get("alerts/json", doc))._source).toEqual(source);
		for (const path of ["alerts/detail", "alerts/json"]) {
			const client = new AbortController();
			documentRead = Promise.withResolvers<AbortSignal>();
			const fetchAborted = assert.rejects(
				send(path, "GET", undefined, org, doc, client.signal),
			);
			const remoteSignal = await documentRead.promise;
			const cancelled = once(remoteSignal, "abort");
			client.abort();
			await Promise.all([fetchAborted, cancelled]);
			documentRead = undefined;
		}
		expect(
			(await send("alerts", "GET", undefined, org, { revision, level: "17" })).status,
		).toBe(400);

		for (const path of ["alerts", "alerts/detail", "alerts/json"]) {
			signIn("pracownik");
			expect((await send(path, "GET", undefined, org, doc)).status).toBe(403);
			signIn("analityk", "second");
			expect((await send(path, "GET", undefined, org, doc)).status).toBe(403);
		}
		signIn("analityk", "second");
		expect((await get("source", {}, "second")).source).toBeNull();
		signIn("analityk", org, "second-session");
		expect((await get("source")).settings).toBeUndefined();
		expect((await get("alerts/json", doc))._source).toEqual(source);
		expect((await send("source", "PUT", config)).status).toBe(403);
		expect(
			(
				await send("alerts", "GET", undefined, org, {
					...historical,
					cursor: first.nextCursor,
				})
			).status,
		).toBe(409);
		retained = false;
		expect((await send("alerts/json", "GET", undefined, org, doc)).status).toBe(404);
		retained = true;

		signIn("admin");
		for (const code of ["TLS", "PERMISSION", "NETWORK"] as const) {
			failure = code;
			const response = await send("source", "PUT", savedConfig);
			expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
				`WAZUH_${code}`,
			);
			expect((await get("source")).source.revision).toBe(revision);
		}
		failure = undefined;
		const authenticated = await send("source", "PUT", { ...savedConfig, password: "invalid" });
		expect(((await authenticated.json()) as { error: { code: string } }).error.code).toBe(
			"WAZUH_AUTHENTICATION",
		);
		expect(
			(
				await send("source", "PUT", {
					revision,
					origin: "https://second.test",
					username: config.username,
				})
			).status,
		).toBe(400);
		expect(
			(await send("source", "PUT", { ...savedConfig, origin: "http://indexer.example.test" }))
				.status,
		).toBe(400);
		partial = true;
		expect((await send("alerts", "GET", undefined, org, { revision })).status).toBe(502);
		partial = false;
		expect((await get("alerts", { revision })).alerts).toEqual(current.alerts);
		expect((await send("source", "PATCH", { revision, enabled: false })).status).toBe(200);
		expect((await send("alerts/json", "GET", undefined, org, doc)).status).toBe(409);
		const disabled = (await get("source")).source;
		expect((await send("source", "DELETE", undefined, org, { revision })).status).toBe(409);
		expect((await send("source", "PUT", savedConfig)).status).toBe(409);
		expect((await send("source", "PATCH", { revision, enabled: true })).status).toBe(409);
		expect((await get("source")).source).toEqual(disabled);
		failure = "NETWORK";
		const enable = { revision: disabled.revision, enabled: true };
		expect((await send("source", "PATCH", enable)).status).toBe(502);
		expect((await get("source")).source.enabled).toBe(false);
		failure = undefined;
		expect((await send("source", "PATCH", enable)).status).toBe(200);
		const enabled = (await get("source")).source;
		expect(enabled.enabled).toBe(true);
		expect(
			(await send("source", "DELETE", undefined, org, { revision: enabled.revision })).status,
		).toBe(200);
		expect(scopes.get(org)).toBeUndefined();
		expect(records[0]!._source).toEqual(source);
	} finally {
		server.closeAllConnections();
		server.close();
		await app.close();
	}
});

test("an active cursor remains valid while another view prunes expired snapshots", async () => {
	const configured = await store.save("cursor-test", { origin, username: "reader", password });
	const started = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	const service = wazuhService({ ...store, get: async () => configured }, 60, (connection) => ({
		...wazuhIndexer(connection),
		openSnapshot: async () => crypto.randomUUID(),
		page: async (_, _id, after) => {
			if (after) {
				started.resolve();
				await finish.promise;
			}
			return { alerts: [], next: after ? undefined : records[0]!.sort };
		},
	}));
	let now = Date.now();
	const clock = spyOn(Date, "now").mockImplementation(() => now);
	const request = new AbortController();
	const list = (view: string, cursor?: string) =>
		service.list(
			configured.organization_id,
			"session",
			configured.revision,
			{},
			request.signal,
			cursor,
			view,
		);
	try {
		const first = await list("first-view");
		now += keepAliveMs - 1;
		const page = list("first-view", first.nextCursor!);
		await started.promise;
		now += 2;
		await list("other-view");
		finish.resolve();
		expect((await page).cursor).toBe(first.nextCursor!);
		expect((await list("first-view", first.nextCursor!)).cursor).toBe(first.nextCursor!);
	} finally {
		finish.resolve();
		clock.mockRestore();
		scopes.delete(configured.organization_id);
	}
});

test("aborted refreshes stop waiting without letting later refreshes overtake the active one", async () => {
	const configured = await store.save("queue-test", { origin, username: "reader", password });
	const sourceRead = Promise.withResolvers<Source>();
	const sourceReadStarted = Promise.withResolvers<void>();
	const secondReady = Promise.withResolvers<void>();
	const thirdReady = Promise.withResolvers<void>();
	const first = new AbortController();
	const second = new AbortController();
	const third = new AbortController();
	let blockNextRead = false;
	let connections = 0;
	let opened = 0;
	const service = wazuhService(
		{
			...store,
			async get() {
				if (!blockNextRead) return configured;
				blockNextRead = false;
				sourceReadStarted.resolve();
				return sourceRead.promise;
			},
		},
		60,
		(connection) => {
			connections++;
			if (connections === 2) secondReady.resolve();
			if (connections === 3) thirdReady.resolve();
			return {
				...wazuhIndexer(connection),
				openSnapshot: async () => String(++opened),
				closeSnapshot: async () => {},
				page: async () => {
					blockNextRead = opened === 1;
					return { alerts: [], next: records[0]!.sort };
				},
			};
		},
	);
	const list = (signal: AbortSignal) =>
		service.list(
			configured.organization_id,
			"session",
			configured.revision,
			{},
			signal,
			undefined,
			"view",
		);
	try {
		const firstFailed = assert.rejects(list(first.signal), { code: "TIMEOUT" });
		await sourceReadStarted.promise;
		const secondFailed = assert.rejects(list(second.signal), { code: "TIMEOUT" });
		await secondReady.promise;
		second.abort();
		await secondFailed;
		const result = list(third.signal);
		await thirdReady.promise;
		expect(opened).toBe(1);
		first.abort();
		await firstFailed;
		expect((await result).nextCursor).not.toBeNull();
		expect(opened).toBe(2);
	} finally {
		first.abort();
		second.abort();
		third.abort();
		sourceRead.resolve(configured);
		scopes.delete(configured.organization_id);
	}
});

test("checks required protected DNS entries before resolving the Indexer", async () => {
	const target = new URL(origin);
	const env = { WAZUH_PROTECTED_HOSTS: " Protected.example.test. " };
	for (const fails of [true, false]) {
		const requested: string[] = [];
		await assert.rejects(
			indexerAddress(target, env, async (name) => {
				requested.push(name);
				if (fails) throw new Error("DNS unavailable");
				return [];
			}),
			{ code: "NETWORK" },
		);
		expect(requested).toContain("protected.example.test");
		expect(requested).not.toContain(target.hostname);
	}
	expect(
		await indexerAddress(target, env, async (name) => {
			if (name === target.hostname) return [{ address: "192.0.2.10", family: 4 }];
			if (name === "protected.example.test") return [{ address: "192.0.2.20", family: 4 }];
			throw new Error("Optional host is absent");
		}),
	).toBe("192.0.2.10");
});

test("blocks loopback, deployment services, and metadata while allowing a private Indexer", async () => {
	for (const host of [
		"127.1",
		"[::1]",
		"[::ffff:127.0.0.1]",
		"169.254.169.254",
		"100.100.100.200",
		"[fd00:ec2::254]",
		"database",
		"10.24.36.51",
	]) {
		const code = await indexerAddress(new URL(`https://${host}:9200`), {
			WAZUH_PROTECTED_HOSTS: "10.24.36.51",
		}).catch((error: unknown) => (error instanceof WazuhError ? error.code : undefined));
		expect(code).toBe("INVALID_ADDRESS");
	}
	expect(await indexerAddress(new URL("https://10.24.36.50:9200"), {})).toBe("10.24.36.50");
	expect(wazuhRefreshSeconds({})).toBe(60);
	expect(wazuhRefreshSeconds({ WAZUH_REFRESH_INTERVAL_SECONDS: "0" })).toBe(0);
	expect(wazuhRefreshSeconds({ WAZUH_REFRESH_INTERVAL_SECONDS: "30" })).toBe(30);
});

test("the Indexer transport honors the shared deadline during address resolution", async () => {
	const request = new AbortController();
	const pending = Promise.withResolvers<string>();
	const send = indexerTransport(
		{ origin, username: "reader", password },
		{},
		() => pending.promise,
	);
	const result = send("POST", "/_search", {}, request.signal);
	request.abort();
	await result.then(
		() => {
			throw new Error("Expected the address lookup to be cancelled");
		},
		(error: unknown) => expect(error).toMatchObject({ code: "TIMEOUT" }),
	);
});

test("verifies the pinned host identity and never follows an HTTPS redirect", async () => {
	const name = "indexer.fixture.test";
	const cert = join(directory, "fixture.crt");
	const privateKey = join(directory, "fixture.key");
	const generated = Bun.spawnSync([
		"openssl",
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-days",
		"1",
		"-subj",
		"/CN=" + name,
		"-addext",
		"subjectAltName=DNS:" + name,
		"-keyout",
		privateKey,
		"-out",
		cert,
	]);
	if (generated.exitCode) throw new Error("Could not generate disposable TLS fixture");
	const ca = await readFile(cert, "utf8");
	const paths: string[] = [];
	const server = createServer({ cert: ca, key: await readFile(privateKey) }, (req, res) => {
		paths.push(req.url ?? "");
		res.writeHead(307, { location: "/redirect-target" }).end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const local = server.address();
		if (!local || typeof local === "string") throw new Error("Expected TCP listener");
		const connect = (host: string) =>
			indexerTransport(
				{ origin: `https://${host}:${local.port}`, ca, username: "fixture", password },
				{},
				async () => "127.0.0.1",
			);
		const failure = (error: unknown) => (error instanceof WazuhError ? error.code : undefined);
		expect(await connect(name)("POST", "/_search", {}).catch(failure)).toBe("UNAVAILABLE");
		expect(paths).toEqual(["/_search"]);
		expect(await connect("wrong.fixture.test")("POST", "/_search", {}).catch(failure)).toBe(
			"TLS",
		);
		expect(paths).toEqual(["/_search"]);
	} finally {
		server.closeAllConnections();
		server.close();
	}
});
