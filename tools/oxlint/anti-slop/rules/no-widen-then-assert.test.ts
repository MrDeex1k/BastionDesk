import { RuleTester } from "oxlint/plugins-dev";

import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "widenThenAssert" };

tester.run("anti-slop/no-widen-then-assert", noWidenThenAssertRule, {
	valid: [
		"const source = { id: 'first' }; const widened: unknown = source;",
		"declare const input: unknown; const parsed = input as { readonly id: string };",
		"const source = { id: 'x' }; const widened: Record<string, unknown> = source; const parsed = widened as Record<string, unknown>;",
		"type Key = string; const source = { id: 'x' }; const widened: Record<string, unknown> = source; const parsed = widened as Record<Key, unknown>;",
	],
	invalid: [
		{
			code: "const source = { id: 'second' }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
			errors: [error],
		},
		{
			code: "const source = { id: 'x' }; const widened: Record<string, unknown> = source; const parsed = widened as Record<'id', unknown>;",
			errors: [error],
		},
		{
			code: "const source = { id: 'second' } satisfies { id: string }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
			errors: [error],
		},
	],
});
