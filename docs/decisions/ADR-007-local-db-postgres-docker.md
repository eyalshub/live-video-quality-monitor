# ADR-007 — Local database is Postgres in Docker

- **Status:** Accepted (2026-11-08)

## Context
Production uses Neon (Postgres). SQLite locally would hide differences (`ON CONFLICT`, CHECK
semantics, `timestamptz`, the UUID type).

## Decision
`docker-compose.yml` runs `postgres:16` with a named volume and a healthcheck. An init script
creates a second database, `vqm_test`, used only by automated tests. CI uses a Postgres 16 service.
The Neon project will also be created on Postgres 16. Fallback if Docker is unavailable: a Neon
dev branch.

## Consequences
- Same SQL dialect everywhere; migrations are tested against the real engine.
- Local development requires Docker Desktop (installed and verified at P0).
