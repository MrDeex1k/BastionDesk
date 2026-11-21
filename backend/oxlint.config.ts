import { defineConfig } from "oxlint";
import { defineConfig as composeConfig } from "oxlint-flat-config";
import { baseConfig, basePlugins } from "../tools/oxlint/base.mts";

export default defineConfig({
	...composeConfig(baseConfig),
	plugins: basePlugins,
	env: { node: true },
	globals: { Bun: "readonly" },
});
