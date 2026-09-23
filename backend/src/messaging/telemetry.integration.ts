import assert from "node:assert/strict";
import express from "express";
import {
	httpTelemetry,
	startTelemetry,
	traced,
	traceParent,
	jobMetric,
	queueMetrics,
	SpanKind,
} from "./telemetry";
const received: { path: string; body: unknown }[] = [];
const collector = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	async fetch(req) {
		received.push({ path: new URL(req.url).pathname, body: await req.json() });
		return Response.json({});
	},
});
process.env.OTEL_ENABLED = "true";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collector.port}`;
process.env.OTEL_LOGS_EXPORTER = "none";
const sdk = startTelemetry("telemetry-probe");
const app = express();
app.use(httpTelemetry);
app.get("/probe", async (_req, res) => {
	const persisted = traceParent();
	await traced("messaging.publish", persisted, SpanKind.PRODUCER, async () => {
		const carrier = traceParent();
		await traced("incident.classify", carrier, SpanKind.CONSUMER, async () => {
			await Bun.sleep(5);
			jobMetric("completed", 5);
		});
	});
	queueMetrics([{ state: "pending", count: 1, lag: 3 }]);
	res.json({ success: true });
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
try {
	const address = server.address();
	assert(address && typeof address !== "string");
	const ids = ["1".repeat(32), "2".repeat(32)];
	await Promise.all(
		ids.map(async (id) => {
			const result = await fetch(`http://127.0.0.1:${address.port}/probe`, {
				headers: { traceparent: `00-${id}-${"3".repeat(16)}-01` },
			});
			assert.equal(result.status, 200);
			await result.text();
		}),
	);
	await sdk.shutdown();
	const bodies = JSON.stringify(received);
	for (const id of ids)
		assert(bodies.includes(id), "trace survives async HTTP -> producer -> consumer");
	for (const name of [
		"http.request",
		"messaging.publish",
		"incident.classify",
		"jobs.backlog",
		"jobs.lag",
		"jobs.processed",
		"jobs.duration",
	])
		assert(bodies.includes(name), name);
	const spans = received
		.filter((item) => item.path === "/v1/traces")
		.flatMap((item) => {
			const body = item.body as {
				resourceSpans: {
					scopeSpans: {
						spans: {
							name: string;
							traceId: string;
							spanId: string;
							parentSpanId: string;
						}[];
					}[];
				}[];
			};
			return body.resourceSpans.flatMap((resource) =>
				resource.scopeSpans.flatMap((scope) => scope.spans),
			);
		});
	for (const id of ids) {
		const own = spans.filter((span) => span.traceId === id);
		assert.equal(own.length, 3);
		const http = own.find((span) => span.name === "http.request")!;
		const producer = own.find((span) => span.name === "messaging.publish")!;
		const consumer = own.find((span) => span.name === "incident.classify")!;
		assert.equal(producer.parentSpanId, http.spanId);
		assert.equal(consumer.parentSpanId, producer.spanId);
	}
	assert(received.some((item) => item.path === "/v1/traces"));
	assert(received.some((item) => item.path === "/v1/metrics"));
	assert(!bodies.includes("userDescription"));
	console.log("PASS OTLP HTTP export, concurrent trace propagation and queue/worker metrics");
} finally {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await collector.stop(true);
}
