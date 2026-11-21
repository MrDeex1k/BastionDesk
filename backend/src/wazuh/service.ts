import {
	keepAliveMs,
	wazuhIndexer,
	type DocumentKey,
	type SearchFilters,
	type Sort,
} from "../adapters/wazuh-indexer";
import {
	assertWithinDeadline,
	draftConnection,
	sourceConnection,
	WazuhError,
	type Source,
	type SourceDraft,
	type SourceConnection,
	type wazuhSourceStore,
	withinDeadline,
} from "./source";

type Cursor = {
	scope: string;
	filters: SearchFilters;
	requested: Range;
	snapshot: Snapshot;
	after?: Sort;
};
type Snapshot = { id: string; expires: number; activeReads: number };
type Range = { from?: string; to?: string; level?: number };
type Store = ReturnType<typeof wazuhSourceStore>;
type Indexer = ReturnType<typeof wazuhIndexer>;
const operationTimeoutMs = 10_000;
const limit = 2048;

function publicStatus(source?: Source) {
	return source ? { enabled: source.enabled, revision: source.revision } : null;
}

export function wazuhService(store: Store, refreshSeconds: number, indexer = wazuhIndexer) {
	const cursors = new Map<string, Cursor>();
	const snapshots = new Map<string, Snapshot>();
	const refreshing = new Map<string, Promise<unknown>>();
	const remember = (cursor: Cursor) => {
		for (const [key, { snapshot }] of cursors)
			if (snapshot.expires <= Date.now() && snapshot.activeReads === 0) cursors.delete(key);
		if (cursors.size >= limit) {
			const oldest = cursors.keys().next().value;
			if (oldest !== undefined) cursors.delete(oldest);
		}
		const id = crypto.randomUUID();
		cursors.set(id, cursor);
		return id;
	};

	async function activeSource(org: string, revision: string, signal: AbortSignal) {
		const source = await withinDeadline(signal, () => store.get(org));
		if (!source) throw new WazuhError("NOT_CONFIGURED");
		if (!source.enabled) throw new WazuhError("DISABLED");
		if (revision !== source.revision) throw new WazuhError("STALE");
		return source;
	}

	async function openAlertSnapshot(remote: Indexer, signal?: AbortSignal) {
		try {
			return await remote.openSnapshot(signal);
		} catch (error) {
			if (!(error instanceof WazuhError) || error.code !== "NOT_FOUND") throw error;
			if (await remote.hasAlertIndices(signal)) throw new WazuhError("UNAVAILABLE");
			return undefined;
		}
	}

	async function verifyConnection(connection: SourceConnection, signal: AbortSignal) {
		const remote = indexer(connection);
		if (await remote.hasAlertIndices(signal)) {
			const pit = await openAlertSnapshot(remote, signal);
			if (pit) await remote.closeSnapshot(pit, signal);
		}
		assertWithinDeadline(signal);
	}

	function operationDeadline(request: AbortSignal) {
		return AbortSignal.any([request, AbortSignal.timeout(operationTimeoutMs)]);
	}

	async function closeSnapshot(
		remote: Indexer,
		scope: string,
		snapshot: Snapshot,
		signal: AbortSignal,
	) {
		await remote.closeSnapshot(snapshot.id, signal);
		snapshot.expires = 0;
		snapshots.delete(scope);
	}

	async function firstPage(
		remote: Indexer,
		org: string,
		revision: string,
		scope: string,
		range: Range,
		signal: AbortSignal,
	) {
		assertWithinDeadline(signal);
		const now = Date.now();
		for (const [key, snapshot] of snapshots)
			if (snapshot.expires <= now && snapshot.activeReads === 0 && !refreshing.has(key))
				snapshots.delete(key);
		const previous = snapshots.get(scope);
		if (!previous && snapshots.size + refreshing.size >= limit)
			throw new WazuhError("UNAVAILABLE");
		if (previous) await closeSnapshot(remote, scope, previous, signal);
		const id = await openAlertSnapshot(remote, signal);
		if (!id) {
			await activeSource(org, revision, signal);
			assertWithinDeadline(signal);
			return { alerts: [], cursor: null, nextCursor: null };
		}
		const filters = {
			from: range.from ?? new Date(now - 24 * 60 * 60_000).toISOString(),
			to: range.to ?? new Date(now).toISOString(),
			level: range.level,
		};
		const snapshot = { id, expires: Date.now() + keepAliveMs, activeReads: 0 };
		snapshots.set(scope, snapshot);
		try {
			const result = await remote.page(filters, id, undefined, signal);
			await activeSource(org, revision, signal);
			assertWithinDeadline(signal);
			if (!result.next) {
				await closeSnapshot(remote, scope, snapshot, signal).catch(() => {});
				assertWithinDeadline(signal);
				return { alerts: result.alerts, cursor: null, nextCursor: null };
			}
			const cursor = { scope, requested: range, filters, snapshot };
			return {
				alerts: result.alerts,
				cursor: remember(cursor),
				nextCursor: remember({ ...cursor, after: result.next }),
			};
		} catch (error) {
			await closeSnapshot(remote, scope, snapshot, signal).catch(() => {});
			if (error instanceof WazuhError && error.code === "NOT_FOUND")
				throw new WazuhError("STALE");
			throw error;
		}
	}

	return {
		async status(org: string, admin: boolean) {
			const source = await store.get(org);
			return {
				source: publicStatus(source),
				refreshSeconds,
				settings:
					source && admin
						? { origin: source.origin, username: source.username, ca: source.ca_pem }
						: undefined,
			};
		},
		async configure(
			org: string,
			draft: SourceDraft,
			revision: string | null,
			activate: boolean,
			request: AbortSignal,
		) {
			const signal = operationDeadline(request);
			const previous = await store.get(org);
			if ((previous?.revision ?? null) !== revision) throw new WazuhError("STALE");
			assertWithinDeadline(signal);
			const connection = await draftConnection(draft, previous);
			await verifyConnection(connection, signal);
			if (activate)
				return publicStatus(
					await store.save(org, connection, revision ?? undefined, signal),
				);
			return { verified: true };
		},
		async setEnabled(org: string, revision: string, enabled: boolean, request: AbortSignal) {
			const signal = operationDeadline(request);
			const source = await store.get(org);
			if (source?.revision !== revision) throw new WazuhError("STALE");
			if (enabled) await verifyConnection(await sourceConnection(source), signal);
			assertWithinDeadline(signal);
			return publicStatus(await store.setEnabled(org, revision, enabled, signal));
		},
		async remove(org: string, revision: string) {
			await store.remove(org, revision);
		},
		async list(
			org: string,
			session: string,
			revision: string,
			range: Range,
			request: AbortSignal,
			token?: string,
			view?: string,
		) {
			const signal = operationDeadline(request);
			const source = await activeSource(org, revision, signal);
			const remote = indexer(await withinDeadline(signal, () => sourceConnection(source)));
			const scope = JSON.stringify([
				org,
				session,
				revision,
				view ?? [range.from, range.to, range.level],
			]);
			if (!token) {
				const previous = refreshing.get(scope);
				const run = () => firstPage(remote, org, revision, scope, range, signal);
				const read = previous ? previous.then(run, run) : run();
				refreshing.set(scope, read);
				// A cancelled caller can leave immediately while later refreshes keep their place.
				const release = () => {
					if (refreshing.get(scope) === read) refreshing.delete(scope);
				};
				void read.then(release, release);
				return withinDeadline(signal, () => read);
			}
			const cursor = cursors.get(token);
			if (
				!cursor ||
				cursor.scope !== scope ||
				refreshing.has(scope) ||
				cursor.snapshot.expires <= Date.now() ||
				cursor.requested.from !== range.from ||
				cursor.requested.to !== range.to ||
				cursor.requested.level !== range.level
			)
				throw new WazuhError("STALE");
			cursor.snapshot.activeReads++;
			try {
				const expires = Date.now() + keepAliveMs;
				const result = await remote.page(
					cursor.filters,
					cursor.snapshot.id,
					cursor.after,
					signal,
				);
				await activeSource(org, revision, signal);
				assertWithinDeadline(signal);
				if (refreshing.has(scope) || snapshots.get(scope) !== cursor.snapshot)
					throw new WazuhError("STALE");
				cursor.snapshot.expires = Math.max(cursor.snapshot.expires, expires);
				return {
					alerts: result.alerts,
					cursor: token,
					nextCursor: result.next ? remember({ ...cursor, after: result.next }) : null,
				};
			} catch (error) {
				if (error instanceof WazuhError && error.code === "NOT_FOUND")
					throw new WazuhError("STALE");
				throw error;
			} finally {
				cursor.snapshot.activeReads--;
			}
		},
		async document(
			org: string,
			revision: string,
			key: DocumentKey,
			full: boolean,
			request: AbortSignal,
		) {
			const signal = operationDeadline(request);
			const source = await activeSource(org, revision, signal);
			const remote = indexer(await withinDeadline(signal, () => sourceConnection(source)));
			const result = await remote.document(key, full, signal);
			await activeSource(org, revision, signal);
			return result;
		},
	};
}
