import "reflect-metadata";
import { Controller, Get, Module, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Response } from "express";
import { domainErrorResponse } from "../contracts/errors";

class CoreErrors implements ExceptionFilter {
	catch(error: unknown, host: ArgumentsHost) {
		const response = domainErrorResponse(error);
		host.switchToHttp().getResponse<Response>().status(response.status).json(response.body);
	}
}
class CoreHealth {
	health() {
		return { success: true, data: { service: "core", status: "ready" } };
	}
}
Controller("api/core")(CoreHealth);
Get("health")(
	CoreHealth.prototype,
	"health",
	Object.getOwnPropertyDescriptor(CoreHealth.prototype, "health")!,
);
class CoreModule {}
Module({ controllers: [CoreHealth] })(CoreModule);

/** Composition root owns lifecycle; Core opens no public listener of its own. */
export async function createCoreApplication() {
	const http = express();
	const app = await NestFactory.create(CoreModule, new ExpressAdapter(http), {
		logger: false,
		bodyParser: false,
	});
	app.useGlobalFilters(new CoreErrors());
	await app.init();
	return { http, close: () => app.close() };
}
