import assert from "node:assert/strict";
import { connect } from "amqplib";

const name = `bastiondesk-messaging-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
async function docker(args: string[]) {
	const child = Bun.spawn(["docker", ...args], {
		env: { ...process.env, RABBITMQ_DEFAULT_PASS: password },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, error, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code) throw new Error(`Docker ${args[0]}: ${error}`);
	return output;
}
let started = false;
try {
	await docker([
		"run",
		"-d",
		"--name",
		name,
		"-e",
		"RABBITMQ_DEFAULT_USER=probe",
		"-e",
		"RABBITMQ_DEFAULT_PASS",
		"-p",
		"127.0.0.1::5672",
		"rabbitmq:4.2.5-management-alpine",
	]);
	started = true;
	let port = (await docker(["port", name, "5672/tcp"])).trim().split(":").at(-1);
	let url = `amqp://probe:${password}@127.0.0.1:${port}`;
	async function ready() {
		for (let n = 0; n < 90; n++) {
			try {
				return await connect(url, { timeout: 2000 });
			} catch {
				await Bun.sleep(500);
			}
		}
		throw new Error("BROKER_START_TIMEOUT");
	}
	const connection = await ready();
	const channel = await connection.createConfirmChannel();
	await channel.assertQueue("probe", { durable: true, arguments: { "x-queue-type": "quorum" } });
	channel.sendToQueue("probe", Buffer.from("durable"), { persistent: true });
	await channel.waitForConfirms();
	await connection.close();
	await docker(["restart", name]);
	port = (await docker(["port", name, "5672/tcp"])).trim().split(":").at(-1);
	url = `amqp://probe:${password}@127.0.0.1:${port}`;
	const restarted = await ready();
	const reader = await restarted.createChannel();
	const message = await reader.get("probe", { noAck: false });
	assert(message && message.content.toString() === "durable");
	await reader.close();
	const retry = await restarted.createChannel();
	const redelivery = await retry.get("probe", { noAck: false });
	assert(redelivery && redelivery.fields.redelivered);
	retry.ack(redelivery);
	await restarted.close();
	console.log("PASS RabbitMQ quorum confirm, restart persistence and unacked redelivery");
} finally {
	if (started) await docker(["rm", "-f", "-v", name]);
}
