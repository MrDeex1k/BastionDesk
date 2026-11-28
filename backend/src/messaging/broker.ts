import { traced, traceCarrier, SpanKind } from "./telemetry";
import { connect, type Channel, type ConfirmChannel, type ConsumeMessage } from "amqplib";
import { readFileSync } from "node:fs";
import { decodeDelivery, topology, type JobTopology } from "./contract";

export async function declareTopology(channel: Channel, queue: JobTopology = topology) {
	await channel.assertExchange(queue.exchange, "direct", { durable: true });
	await channel.assertExchange(queue.deadExchange, "direct", { durable: true });
	await channel.assertQueue(queue.deadQueue, {
		durable: true,
		arguments: { "x-queue-type": "quorum" },
	});
	await channel.bindQueue(queue.deadQueue, queue.deadExchange, queue.routingKey);
	await channel.assertQueue(queue.queue, {
		durable: true,
		arguments: {
			"x-queue-type": "quorum",
			"x-overflow": "reject-publish",
			"x-dead-letter-exchange": queue.deadExchange,
			"x-dead-letter-routing-key": queue.routingKey,
			"x-dead-letter-strategy": "at-least-once",
			"x-delivery-limit": 20,
		},
	});
	await channel.bindQueue(queue.queue, queue.exchange, queue.routingKey);
}

/** One in-flight publish per channel; a return must fail even when confirmed. */
export async function publishConfirmed(
	channel: ConfirmChannel,
	jobId: string,
	dead = false,
	parent?: string | null,
	queue: JobTopology = topology,
) {
	return traced("messaging.publish", parent, SpanKind.PRODUCER, async () => {
		const delivery = Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: queue.routingKey, jobId }),
		);
		decodeDelivery(delivery, queue.routingKey);
		let returned = false;
		const onReturn = () => {
			returned = true;
		};
		channel.on("return", onReturn);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				new Promise<void>((resolve, reject) => {
					channel.publish(
						dead ? queue.deadExchange : queue.exchange,
						queue.routingKey,
						delivery,
						{
							persistent: true,
							mandatory: true,
							messageId: jobId,
							contentType: "application/json",
							headers: traceCarrier(),
						},
						(error) => (error ? reject(error) : resolve()),
					);
				}),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new Error("CONFIRM_TIMEOUT")), 5000);
				}),
			]);
			if (returned) throw new Error("UNROUTABLE_MESSAGE");
		} finally {
			clearTimeout(timer);
			channel.off("return", onReturn);
		}
	});
}

export function brokerOptions(environment: Record<string, string | undefined>) {
	const url = environment.RABBITMQ_URL;
	if (!url) throw new Error("RABBITMQ_URL_REQUIRED");
	const parsed = new URL(url);
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
	if (
		parsed.protocol === "amqp:" &&
		local &&
		environment.MESSAGING_ALLOW_LOCAL_PLAINTEXT === "true"
	)
		return { url, socket: { timeout: 5000 } };
	if (parsed.protocol !== "amqps:" || !environment.RABBITMQ_TLS_CA)
		throw new Error("RABBITMQ_TLS_REQUIRED");
	return {
		url,
		socket: {
			timeout: 5000,
			rejectUnauthorized: true,
			ca: [readFileSync(environment.RABBITMQ_TLS_CA)],
			servername: parsed.hostname,
		},
	};
}

export async function openBroker(environment = process.env, queue: JobTopology = topology) {
	const options = brokerOptions(environment);
	const connection = await connect(options.url, options.socket);
	const failed = () => console.error("[MESSAGING] Broker connection interrupted");
	connection.on("error", failed);
	const publisher = await connection.createConfirmChannel();
	const consumer = await connection.createChannel();
	publisher.on("error", failed);
	consumer.on("error", failed);
	try {
		await declareTopology(publisher, queue);
		await consumer.prefetch(1);
	} catch (error) {
		await connection.close().catch(() => {});
		throw error;
	}
	return {
		connection,
		publisher,
		consumer,
		async consume(
			handle: (delivery: ReturnType<typeof decodeDelivery>, parent?: string) => Promise<void>,
		) {
			return consumer.consume(
				queue.queue,
				(message: ConsumeMessage | null) => {
					if (!message) {
						void connection.close().catch(() => {});
						return;
					}
					let delivery: ReturnType<typeof decodeDelivery>;
					try {
						delivery = decodeDelivery(message.content, queue.routingKey);
					} catch {
						consumer.nack(message, false, false);
						return;
					}
					const parent = message.properties.headers?.traceparent;
					void handle(
						delivery,
						typeof parent === "string" && parent.length <= 128 ? parent : undefined,
					)
						.then(() => consumer.ack(message))
						.catch(() => {
							// A database outage must not turn into a tight requeue loop. Reconnect later.
							void connection.close().catch(() => {});
						});
				},
				{ noAck: false },
			);
		},
	};
}
