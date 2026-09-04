import { describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { paginationSchema, validate, validateMultiple } from "./validation.js";

function expressFiveRequestWithQueryGetter(): Request {
	return Object.create({
		get query() {
			return {};
		},
	}) as Request;
}

function runMiddleware(
	middleware: (req: Request, res: Response, next: NextFunction) => void,
): Request {
	const request = expressFiveRequestWithQueryGetter();
	let nextCalled = false;
	middleware(request, {} as Response, () => {
		nextCalled = true;
	});
	expect(nextCalled).toBe(true);
	return request;
}

describe("request validation", () => {
	test("persists query defaults on an Express 5 getter", () => {
		const request = runMiddleware(validate(paginationSchema, "query"));
		expect(request.query as unknown).toEqual({ page: 1, limit: 20 });
	});

	test("persists query defaults when validating multiple targets", () => {
		const request = runMiddleware(validateMultiple({ query: paginationSchema }));
		expect(request.query as unknown).toEqual({ page: 1, limit: 20 });
	});
});
