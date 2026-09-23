import "reflect-metadata";
import {
	Controller,
	Get,
	RequestMapping,
	RequestMethod,
	Module,
	Req,
	Res,
	type ArgumentsHost,
	type ExceptionFilter,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Response, type Request } from "express";
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
export async function createCoreApplication(
	routes: {
		paths: string[];
		method?: "get" | "post" | "patch" | "put";
		handle(req: Request, res: Response): Promise<unknown>;
	}[] = [],
) {
	const controllers = routes.map((route) => {
		class Endpoint {
			handle(req: Request, res: Response) {
				return route.handle(req, res);
			}
		}
		Controller()(Endpoint);
		RequestMapping({
			path: route.paths,
			method: {
				get: RequestMethod.GET,
				post: RequestMethod.POST,
				patch: RequestMethod.PATCH,
				put: RequestMethod.PUT,
			}[route.method ?? "get"],
		})(
			Endpoint.prototype,
			"handle",
			Object.getOwnPropertyDescriptor(Endpoint.prototype, "handle")!,
		);
		Req()(Endpoint.prototype, "handle", 0);
		Res()(Endpoint.prototype, "handle", 1);
		return Endpoint;
	});
	class ConfiguredCore {}
	Module({ imports: [CoreModule], controllers })(ConfiguredCore);
	const http = express();
	const app = await NestFactory.create(ConfiguredCore, new ExpressAdapter(http), {
		logger: false,
		bodyParser: false,
	});
	app.useGlobalFilters(new CoreErrors());
	await app.init();
	return { http, close: () => app.close() };
}
