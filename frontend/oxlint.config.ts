import { defineConfig } from "oxlint";
import { category, defineConfig as composeConfig } from "oxlint-flat-config";
import { baseConfig, basePlugins } from "../tools/oxlint/base.mts";

export default defineConfig({
  ...composeConfig(baseConfig, category({ correctness: "error", plugins: ["react"] }), {
    name: "bastiondesk/frontend",
    jsPlugins: ["@shadcn/lint"],
    rules: {
      "shadcn/no-inline-styles": "error",
      "shadcn/no-unknown-classes": "error",
    },
  }),
  plugins: [...basePlugins, "react"],
  env: { browser: true },
  ignorePatterns: ["dist/**", "src/routeTree.gen.ts"],
});
