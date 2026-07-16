# Changelog

All notable changes to BastionDesk will be documented in this file.

## [1.0.2] - 2026-07-16

Maintenance release focused on developer tooling, reproducible dependency resolution and refreshed container foundations for the supported Docker Compose deployment.

### Changed

- Migrated frontend linting from ESLint and backend checks from Biome to type-aware OxLint.
- Added OxFmt as the formatter for the frontend and backend and normalized the existing TypeScript and TSX sources.
- Updated the frontend and backend toolchain to TypeScript `7.0.2`.
- Updated frontend ECMAScript compilation targets and libraries from `ES2025` to `ESNext`.
- Updated frontend and backend dependencies and regenerated their Bun lockfiles.
- Replaced semver ranges in Bun package manifests with exact dependency versions for more reproducible installations.
- Reduced the Bun dependency release-age gate from 60 hours to 48 hours while retaining protection from freshly published package versions.
- Updated the `llm_service` Python dependencies and regenerated its `uv.lock` file.
- Replaced Python dependency ranges in `llm_service/pyproject.toml` with exact `==` version pins.
- Reduced the `uv` dependency release-age gate from 60 hours to 48 hours to match the Bun policy.
- Updated the README technology overview to reflect the Oxc toolchain.

### Infrastructure

- Updated public and frontend nginx images from `nginx:1.31.1-alpine` to `nginx:1.31.2-alpine3.23`.
- Updated PgBouncer from `edoburu/pgbouncer:v1.25.1-p0` to `edoburu/pgbouncer:v1.25.2-p0`.
- Updated BusyBox helper stages from `busybox:1.37.0-musl` to `busybox:1.38.0-musl`.
- Updated the `llm_service` builder and runtime images from `ghcr.io/astral-sh/uv:0.11.7-python3.13-trixie-slim` to `ghcr.io/astral-sh/uv:0.11.28-python3.13-trixie-slim`.

### Known Notes

- `1.0.2` remains within the `fresh install only` release model.
- The supported deployment model remains self-hosted Docker Compose through the existing public entrypoint at `http://localhost:4567`.
- This release does not intentionally change the application API, database schema or user-facing feature set.

## [1.0.1] - 2026-05-29

Patch release focused on security hardening, deployment cleanup, admin incident filtering improvements and safer runtime behavior for the supported Docker Compose installation.

### Changed

- Consolidated the supported public entrypoint around `http://localhost:4567`.
- Updated `.env.example` for same-origin frontend API access with `VITE_API_URL` omitted by default and `VITE_API_TIMEOUT_MS=15000`.
- Updated Better Auth defaults to use the reverse proxy origin.
- Added `CSRF_SECRET` environment configuration.
- Added optional outbound proxy configuration for `llm_service` through `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`.
- Updated API and infrastructure documentation to use the reverse proxy entrypoint and the current single-entrypoint deployment model.
- Updated base images for PostgreSQL, nginx and storage runtime.

### Security

- Added CSRF protection for state-changing application API routes.
- Added frontend CSRF token bootstrap, token refresh and retry behavior for stale CSRF tokens.
- Added stricter runtime validation for frontend, auth, WebAuthn, CORS and trusted origin configuration.
- Added production checks for HTTPS origins and strong `CSRF_SECRET`.
- Added browser security headers to public and frontend nginx.
- Removed direct public proxy routing to `/llm/` from nginx.
- Removed default host port publishing for backend, PostgreSQL, PgBouncer, MinIO and LLM service in the supported Compose path.
- Reduced sensitive auth, email and error logging.

### Fixed

- Improved LLM client error mapping for timeout, unavailable, invalid request and invalid response cases.
- Improved `llm_service` health reporting with explicit `ok` / `degraded` status and HTTP `503` when the model is not loaded.
- Replaced unsafe parameterized SQL helper execution with `pg` Pool queries.
- Hardened admin and analyst incident sorting through explicit SQL column allowlists.
- Improved admin incident filtering with dynamic analyst options and real user search by ID, name and email.
- Shared scoped incident update logic across analyst and admin incident operations.
- Improved frontend API error handling, request timeouts and CSRF retry behavior.

### Frontend

- Added lazy loading for heavier dashboard sections, incident details, settings and incident report forms.
- Added clearer loading states for dashboard and incident-detail views.
- Added `react-doctor` developer script.

### Known Notes

- `1.0.1` remains within the `fresh install only` release model.
- Internal services are no longer directly reachable from the host in the default Compose setup.
- Environments without direct internet access can now route `llm_service` model downloads through an outbound proxy.

## [1.0.0] - 2026-05-16

First public release of BastionDesk.

This version establishes the first supported self-hosted release of the platform and delivers the complete baseline product: authentication, organizations, incident reporting, analyst workflow, evidence storage, local LLM-based classification, Docker Compose deployment, backup automation and core security hardening.

### Included

- First supported self-hosted Docker Compose deployment for the full BastionDesk stack.
- Better Auth based authentication with email/password, session cookies, passkeys/WebAuthn support, organization membership and role-based access control for `pracownik`, `analityk` and `admin`.
- Employee incident reporting flow with support for descriptions, screenshots and file attachments.
- Analyst workflow covering incident assignment, prioritization, notes, status handling, report upload and final statement upload.
- Administrative organization management, user membership handling and analytics views for incident operations.
- Local LLM classification service based on `google/gemma-3-1b-it`, exposed over gRPC with mTLS for automatic incident category assignment (`Czerwony`, `Żółty`, `Zielony`).
- S3-compatible evidence storage on distributed MinIO with automatic bucket creation and bucket versioning.
- Automatic PostgreSQL backup service with scheduled compressed dumps written to MinIO and verified restore support.
- Public project metadata and release files including `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `.env.example` and infrastructure documentation.
- Unified project versioning to `1.0.0` across frontend, backend and runtime metadata.
- Standardized the supported entry point to the application behind reverse proxy at `http://localhost:4567`.
- Standardized dependency hygiene with `minimumReleaseAge = 216000` for Bun and `exclude-newer = "60 hours"` for `uv`.
- Standardized backend object storage on native `Bun.S3Client` for the MinIO integration used in the supported deployment.
- Standardized the frontend runtime around Vite `8.0.12`, route-level code splitting and the current React 19 / TanStack Query v5 architecture.
- Standardized the container runtime with multi-stage builds, non-root services, healthchecks and `restart: unless-stopped`.
- Frontend codebase cleanup and stabilization for the first public release, including typed API models, shared request helpers, shared validation and route-level code splitting.
- React Query based organization, auth and incident flows aligned with the current application architecture.
- Verified runtime behavior for the supported Compose deployment, including application startup, MinIO-backed file upload/download and PostgreSQL backup/restore workflow.
- Distributed MinIO bootstrap with automatic bucket versioning and backend storage integration over HTTPS.
- Rootless runtime for core application containers and backup service in the official deployment path.

### Security

- Released the community edition under `AGPL-3.0-only`.
- Enabled TLS or mTLS for PostgreSQL, PgBouncer, backend to LLM and backend to MinIO communication in the supported Compose deployment.
- Added Helmet, CORS allowlisting, rate limiting and Zod validation to the backend runtime.
- Added non-root runtime for core application containers (`backend`, `frontend`, `nginx`, `llm_service`, `postgres-backup`).
- Introduced package age gates for Bun and `uv` to reduce exposure to freshly published supply-chain regressions.

### Known Limitations

- `1.0.0` supports `fresh install only`; no official in-place upgrade path is provided for older installations.
- The supported release model is self-hosted Docker Compose; other orchestrators are outside the documented `1.0.0` deployment scope.
- `llm_service` has noticeable memory requirements and may have a cold start while the model is loading.
- The local TLS generator under `infra/tls/` is intended for development and should be replaced with production PKI in public environments.
- Compose exposes infrastructure ports in addition to the main reverse proxy; production environments should narrow exposure to their own needs.
