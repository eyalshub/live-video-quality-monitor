# ADR-008 — One source for the API contract

- **Status:** Accepted (2026-11-08)

## Context
Hand-written TypeScript copies of the API types drift from the backend silently.

## Decision
Backend Pydantic models → FastAPI OpenAPI schema → `openapi-typescript` generates
`frontend/src/api/schema.d.ts` via `npm run gen:api` (which reads `VITE_API_BASE_URL`). The
generated file is committed so the frontend builds and type-checks without a running backend.
There are no hand-written duplicates of API types.

## Consequences
- An API change is two steps: change the backend, then regenerate the types.
- `docs/api-contract.md` documents only behavior the schema cannot express.
