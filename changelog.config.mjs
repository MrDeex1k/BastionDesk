import createPreset from "conventional-changelog-conventionalcommits";

export default await createPreset({
	types: [
		{ type: "feat", section: "Features" },
		{ type: "feature", section: "Features" },
		{ type: "fix", section: "Bug Fixes" },
		{ type: "perf", section: "Performance Improvements" },
		{ type: "refactor", section: "Code Refactoring" },
		{ type: "docs", section: "Documentation" },
		{ type: "chore", section: "Maintenance" },
		{ type: "build", section: "Build System" },
		{ type: "ci", section: "Continuous Integration" },
		{ type: "test", section: "Tests" },
		{ type: "style", section: "Styles" },
		{ type: "revert", section: "Reverts" },
	],
});
