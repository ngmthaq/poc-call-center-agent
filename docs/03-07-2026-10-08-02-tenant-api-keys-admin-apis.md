- Author: Root Agent (party-mode)
- Title: Plan — Tenant API-Key Admin APIs (#25–26)
- Classification: feature
- Description: Add a nested `/admin/tenants/:id/keys` slice (validator → controller → service methods → nested route) that mints an API key returning the raw secret exactly once (#25) and lists a tenant's keys by prefix only, never exposing the raw value or `keyHash` (#26).

---

## Approach Summary

- Mirror the existing tenant vertical slice: a yup validator, thin controller translating `null`→404, and service methods on the existing `ApiKeyService` (the ApiKey domain service). Keys are a sub-resource of a tenant, so the route mounts as a `mergeParams` sub-router under `tenant.route.ts`, inheriting its `adminAuth()` guard — no second auth layer.
- `ApiKeyService.createForTenant` generates the raw key via the existing `apiKeyUtil.generateKey()`, persists only `keyHash` + `keyPrefix` + `scopes`, and returns `{ apiKey: <summary>, key: raw }` where the summary is `Omit<ApiKey, 'keyHash'>`. The raw secret is returned to the caller once and never re-derivable.
- `listForTenant` strips `keyHash` from every row before it leaves the service, structurally guaranteeing #26's "never raw/hash".
- Tenant existence is checked explicitly (findUnique → `null`) so both endpoints return a clean 404 for an unknown `:id` rather than surfacing a Prisma FK error.

## Functional Requirements

- **#25 `POST /admin/tenants/:id/keys`** — body `{ name, scopes[], expiresAt? }` → **201** `{ apiKey, key }` where `key` is the raw secret shown once and `apiKey` excludes `keyHash`; **422** invalid/empty scopes or bad body (see deviation note); **404** unknown tenant; **401** without a valid admin token.
- **#26 `GET /admin/tenants/:id/keys`** → **200** `{ items }` — each item is an `ApiKeySummary` (id, name, keyPrefix, scopes, status, expiresAt, lastUsedAt, revokedAt, botId, timestamps); **never** `keyHash` and **never** the raw value. **404** unknown tenant; **401** without a valid admin token.

## Non-Functional Requirements

- Follow layering (route→controller→service→utils), kebab-case `*.ts` naming, types in `src/types/*.d.ts` (never inline), extensionless ESM imports.
- Security: raw key never logged; `keyHash` never serialized to any response; CSPRNG generation reused from `apiKeyUtil` (no new crypto).
- Reuse `responseHandlerUtil` envelope and `requestValidatorMiddleware` for body validation.

## Files in Scope

- **Create:** `src/validators/api-key.validator.ts`, `src/controllers/api-key.controller.ts`, `src/routes/api-key.route.ts`
- **Modify:** `src/types/api-key.d.ts` (add `ApiKeySummary`, `CreatedApiKey`), `src/services/api-key.service.ts` (add `createForTenant`, `listForTenant`), `src/controllers/index.ts` (barrel export), `src/validators/index.ts` (barrel export), `src/routes/tenant.route.ts` (mount `/:id/keys` sub-router)

## Risks & Assumptions

- **⚠️ DEVIATION (needs confirmation): invalid scope → 422, not the ticket's "400".** The shared `requestValidatorMiddleware` maps every yup `ValidationError` to **422**, and the tenant CRUD plan explicitly "kept the 422 convention". Forcing only the `scopes` field to 400 would require bypassing the middleware for one field — inconsistent. Chosen: validate scopes in-schema → 422. If you want the literal 400, the controller does an explicit pre-check instead.
- **Assumption:** create body = `name` + `scopes` (≥1, each a valid `ApiKeyScope`) + optional `expiresAt` (must be in the future). Per-bot binding (`botId`) is **deferred** — it needs a same-tenant ownership check beyond this ticket's scope.
- **Assumption:** list is a plain `{ items }` array ordered by `createdAt desc` (keys per tenant are few; no pagination). Unknown tenant → **404** on both endpoints for consistency.
- **Risk:** a `keyHash` unique collision (P2002) is astronomically unlikely for a 256-bit key and is left to propagate as 500 (not caught) — acceptable, matches the entropy assumption in the #7 util plan.

## Open Questions / Blockers

- The three AskUserQuestion items (scope status code, create-body fields, list shape/404) were unanswered (user away). Proceeding on the documented defaults above; these are the confirmation points at the approval gate.

## Status

- [x] Ready to execute (pending approval-gate confirmation of the 422 deviation)
- [ ] Blocked

## Task List

| #   | Status | Task                                                                                                                | Responsible Role | Dependencies | Skills                           |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ | -------------------------------- |
| 1   | DONE   | Add `ApiKeySummary` (`Omit<ApiKey,'keyHash'>`) + `CreatedApiKey` to `src/types/api-key.d.ts`                        | developer        | none         | `clean-code`                     |
| 2   | DONE   | Create `api-key.validator.ts` (`createApiKeySchema`: name, scopes ≥1 valid enum, future `expiresAt?`) + barrel      | developer        | none         | `clean-code`                     |
| 3   | DONE   | Add `ApiKeyService.createForTenant` + `listForTenant` (tenant-exists→null-for-404; Prisma `omit` keyHash; raw once) | developer        | 1            | `clean-code`, `security-scanner` |
| 4   | DONE   | Create `ApiKeyController` (handleCreate→201 `{apiKey,key}`, handleList→`{items}`; null→404) + barrel export         | developer        | 2,3          | `clean-code`                     |
| 5   | DONE   | Create `api-key.route.ts` (mergeParams; POST+validator, GET) and mount at `/:id/keys` in `tenant.route.ts`          | developer        | 4            | `clean-code`                     |

> **Review (Step 6): ACCEPTED.** Round 1 flagged a lint failure (rest-omit `_keyHash` unused var → `no-unused-vars`); round 2 fixed it with Prisma's `omit: { keyHash: true }` (stronger — hash never selected). Final: `typecheck` clean, `lint` clean, no keyHash/raw-key leak in any HTTP path.

> Testing Workflow is **Skip-Testing** (mirrors the sibling #20–24 plan): no tester sub-agent. Acceptance verified at Step 6 review via `pnpm --filter server typecheck`, lint, secret-scanner + security-scanner on the diff, and code inspection against these requirements.
