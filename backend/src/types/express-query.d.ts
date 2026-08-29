import "express-serve-static-core";

declare module "express-serve-static-core" {
	interface IRouter {
		query: IRouterMatcher<this>;
	}

	interface IRoute<Route extends string = string> {
		query: IRouterHandler<this, Route>;
	}
}
