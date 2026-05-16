# Contributing to BastionDesk

Thank you for your interest in contributing to BastionDesk.

## License of Contributions

BastionDesk Community Edition is licensed under the GNU Affero General Public License v3.0. By submitting a contribution, you agree that your contribution will be licensed under AGPLv3.

Only submit code, documentation, designs, generated assets, configuration, or other materials that you have the right to contribute.

Contributors are responsible for ensuring that submitted material does not violate third-party licenses, confidentiality obligations, or intellectual property rights.

## Commercial Licensing and Dual Licensing

BastionDesk may offer separate commercial licensing for organizations that need proprietary use, private forks, embedding, SaaS redistribution, or other usage that is not compatible with AGPLv3 obligations.

External contributions are accepted under AGPLv3, but a formal Contributor License Agreement (CLA) is required before a non-trivial external contribution can be merged.

The CLA is intended to keep contribution provenance clear and to ensure that accepted external contributions may also be used in future commercial or dual-licensed distributions.

The current CLA text is available in `docs/CLA.md`.

For the current manual process, external contributors must post the following comment in the pull request before merge:

`I have read and agree to the BastionDesk CLA in docs/CLA.md`

By opening a pull request, you may be asked to complete the CLA confirmation process before review is completed or before the pull request can be merged.

Maintainers may postpone, pause, or decline external contributions until the CLA requirement is satisfied.

## Security Issues

Do not report vulnerabilities in public issues or pull requests. Follow the process described in `SECURITY.md`.

## Secrets and Sensitive Data

Never include real credentials, tokens, private keys, production `.env` files, customer data, or private logs in issues, pull requests, commits, screenshots, or examples.

Use `.env.example` for documentation and placeholders only.

## Before You Start

Please open an issue before opening a pull request whenever possible.

For larger changes that are not direct bug fixes, maintainers prefer discussion first so scope, direction, and fit can be reviewed before implementation starts.

Maintainers may postpone or decline contributions that significantly expand scope, introduce unrelated refactors, or make licensing or provenance review unclear.

## Development Checks

Before opening a pull request, run the relevant checks for the parts you changed.

Backend:

- `cd backend`
- `bun run typecheck`
- `bun run lint`

Frontend:

- `cd frontend`
- `bun run build`
- `bun run lint`

If your change affects setup, deployment, environment variables, Docker, TLS, or operational behavior, update the relevant documentation in the same pull request.

## Pull Request Checklist

Before opening a pull request:

- open or reference the related issue when applicable,
- be prepared to complete the project's CLA process if the change is an external contribution,
- if requested, post the CLA confirmation comment exactly as described in `docs/CLA.md`,
- make sure the change is scoped and easy to review,
- explain what changed, why it changed, and any setup or behavior impact,
- update documentation when behavior or setup changes,
- run the relevant Bun checks for the changed package,
- keep each pull request focused on a single topic,
- avoid unrelated formatting or refactors,
- confirm that no secrets or private data are included.
