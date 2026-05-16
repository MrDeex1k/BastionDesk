# Changelog

All notable changes to BastionDesk will be documented in this file.

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
