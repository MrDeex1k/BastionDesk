import { connect, type Channel, type ConfirmChannel, type ConsumeMessage } from "amqplib";
import { readFileSync } from "node:fs";
import { decodeDelivery, deliverySchema, topology, type Delivery } from "./contract";

export async function declareTopology(channel: Channel) {
	await channel.assertExchange(topology.exchange, "direct", { durable: true });
	await channel.assertExchange(topology.deadExchange, "direct", { durable: true });
	await channel.assertQueue(topology.deadQueue, {
		durable: true,
		arguments: { "x-queue-type": "quorum" },
	});
	await channel.bindQueue(topology.deadQueue, topology.deadExchange, topology.routingKey);
	await channel.assertQueue(topology.queue, {
		durable: true,
		arguments: {
			"x-queue-type": "quorum",
			"x-overflow": "reject-publish",
			"x-dead-letter-exchange": topology.deadExchange,
			"x-dead-letter-routing-key": topology.routingKey,
			"x-dead-letter-strategy": "at-least-once",
			"x-delivery-limit": 20,
		},
	});
	await channel.bindQueue(topology.queue, topology.exchange, topology.routingKey);
}

/** One in-flight publish per channel; a return must fail even when confirmed. */
export async function publishConfirmed(channel: ConfirmChannel, jobId: string, dead = false) {
	const delivery = deliverySchema.parse({ schemaVersion: 1, type: topology.routingKey, jobId });
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
					dead ? topology.deadExchange : topology.exchange,
					topology.routingKey,
					Buffer.from(JSON.stringify(delivery)),
					{
						persistent: true,
						mandatory: true,
						messageId: jobId,
						contentType: "application/json",
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

export async function openBroker(environment = process.env) {
	const options = brokerOptions(environment);
	const connection = await connect(options.url, options.socket);
	const failed = () => console.error("[MESSAGING] Broker connection interrupted");
	connection.on("error", failed);
	const publisher = await connection.createConfirmChannel();
	const consumer = await connection.createChannel();
	publisher.on("error", failed);
	consumer.on("error", failed);
	try {
		await declareTopology(publisher);
		await consumer.prefetch(1);
	} catch (error) {
		await connection.close().catch(() => {});
		throw error;
	}
	return {
		connection,
		publisher,
		consumer,
		async consume(handle: (delivery: Delivery) => Promise<void>) {
			return consumer.consume(
				topology.queue,
				(message: ConsumeMessage | null) => {
					if (!message) {
						void connection.close().catch(() => {});
						return;
					}
					let delivery: Delivery;
					try {
						delivery = decodeDelivery(message.content);
					} catch {
						consumer.nack(message, false, false);
						return;
					}
					void handle(delivery)
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
