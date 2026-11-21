import { fileURLToPath } from "node:url";
import type { OxlintConfig } from "oxlint";
import { category, type ConfigInput } from "oxlint-flat-config";

export const basePlugins = ["eslint", "typescript", "unicorn", "oxc"] satisfies NonNullable<
  OxlintConfig["plugins"]
>;

export const baseConfig: ConfigInput[] = [
  category({ correctness: "error", plugins: basePlugins }),
  {
    name: "bastiondesk/base",
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: fileURLToPath(new URL("./anti-slop/index.ts", import.meta.url)),
      },
    ],
    rules: {
      "anti-slop/no-chained-type-assertions": "warn",
      "anti-slop/no-widen-then-assert": "warn",
      "anti-slop/no-reduce-accumulator-copy": "warn",
      "oxc/no-accumulating-spread": "warn",
    },
  },
];
