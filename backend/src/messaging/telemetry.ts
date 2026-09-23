import {
	context,
	propagation,
	trace,
	SpanKind,
	SpanStatusCode,
	metrics as apiMetrics,
	ROOT_CONTEXT,
} from "@opentelemetry/api";
import { NodeSDK, metrics } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { RequestHandler } from "express";

export function startTelemetry(serviceName: string) {
	if (process.env.OTEL_ENABLED !== "true") return { shutdown: async () => {} };
	if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) throw new Error("OTEL_ENDPOINT_REQUIRED");
	const sdk = new NodeSDK({
		serviceName,
		traceExporter: new OTLPTraceExporter(),
		metricReaders: [
			new metrics.PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter(),
				exportIntervalMillis: 10000,
			}),
		],
	});
	sdk.start();
	return sdk;
}
export function traceCarrier(): Record<string, string> {
	const carrier: Record<string, string> = {};
	propagation.inject(context.active(), carrier);
	return carrier;
}
export function traceParent() {
	return traceCarrier().traceparent;
}
export async function traced<T>(
	name: string,
	parent: string | null | undefined,
	kind: SpanKind,
	work: () => Promise<T>,
): Promise<T> {
	const ctx = parent
		? propagation.extract(ROOT_CONTEXT, { traceparent: parent })
		: context.active();
	return trace.getTracer("bastiondesk").startActiveSpan(name, { kind }, ctx, async (span) => {
		try {
			return await work();
		} catch (error) {
			span.setStatus({ code: SpanStatusCode.ERROR, message: "operation failed" });
			throw error;
		} finally {
			span.end();
		}
	});
}
export const httpTelemetry: RequestHandler = (req, res, next) => {
	if (req.path.endsWith("/health")) return next();
	const started = performance.now();
	const ctx = propagation.extract(ROOT_CONTEXT, { traceparent: req.get("traceparent") });
	const span = trace
		.getTracer("bastiondesk")
		.startSpan("http.request", { kind: SpanKind.SERVER }, ctx);
	let ended = false;
	const finish = () => {
		if (ended) return;
		ended = true;
		span.setAttribute("http.response.status_code", res.statusCode);
		if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
		span.end();
		apiMetrics
			.getMeter("bastiondesk")
			.createHistogram("http.server.duration", { unit: "s" })
			.record((performance.now() - started) / 1000, {
				"http.response.status_code": res.statusCode,
			});
	};
	res.once("finish", finish);
	res.once("close", finish);
	context.with(trace.setSpan(ctx, span), next);
};
export function jobSpanDetails(id: string, correlationId: string, attempt: number) {
	trace
		.getActiveSpan()
		?.setAttributes({ "job.id": id, "job.attempt": attempt, "correlation.id": correlationId });
}
export function jobMetric(outcome: string, duration: number) {
	trace.getActiveSpan()?.setAttribute("job.outcome", outcome);
	if (["retry", "dead", "storage_error"].includes(outcome))
		trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message: outcome });
	const meter = apiMetrics.getMeter("bastiondesk");
	meter.createCounter("jobs.processed").add(1, { outcome });
	meter.createHistogram("jobs.duration", { unit: "s" }).record(duration / 1000, { outcome });
}
export function queueMetrics(values: { state: string; count: number; lag: number }[]) {
	const meter = apiMetrics.getMeter("bastiondesk");
	for (const state of ["pending", "running", "dead"]) {
		const value = values.find((row) => row.state === state);
		meter.createGauge("jobs.backlog").record(value?.count ?? 0, { state });
		meter.createGauge("jobs.lag", { unit: "s" }).record(value?.lag ?? 0, { state });
	}
}
export { SpanKind };
