import { ApiKeyScope, ApiKeyStatus, TenantStatus } from '@prisma/client';
import type { ApiKey, ApiKeyUsage } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import type {
  ApiKeySummary,
  BotBindingResolution,
  CreatedApiKey,
} from '../types/api-key';
import { apiKeyUtil, prismaUtil } from '../utils';
import type { CreateApiKeyBody } from '../validators';

export class ApiKeyService {
  /**
   * Mints a new API key for the tenant identified by `tenantId`. Returns the
   * created key summary plus the raw secret — exposed exactly once — or `null`
   * when no tenant matches so the controller can emit a 404.
   *
   * Only the deterministic `keyHash` is persisted; the raw secret is never
   * logged or stored, and `keyHash` is stripped from the returned summary so it
   * never reaches the HTTP layer.
   */
  public async createForTenant(
    tenantId: string,
    body: CreateApiKeyBody,
  ): Promise<CreatedApiKey | null> {
    const tenant = await prismaUtil.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant === null) {
      return null;
    }

    const { raw, keyHash, keyPrefix } = apiKeyUtil.generateKey();

    const created = await prismaUtil.client.apiKey.create({
      data: {
        tenantId,
        name: body.name,
        keyHash,
        keyPrefix,
        scopes: body.scopes,
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      },
      omit: { keyHash: true },
    });

    return { apiKey: created, key: raw };
  }

  /**
   * Lists every API key owned by the tenant identified by `tenantId`, newest
   * first, or `null` when no tenant matches so the controller can emit a 404.
   *
   * Each row is reduced to an `ApiKeySummary` with the secret `keyHash` removed,
   * so only the display `keyPrefix` — never the raw key or its hash — is exposed.
   */
  public async listForTenant(
    tenantId: string,
  ): Promise<ApiKeySummary[] | null> {
    const tenant = await prismaUtil.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant === null) {
      return null;
    }

    const rows = await prismaUtil.client.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      omit: { keyHash: true },
    });

    return rows;
  }

  /**
   * Verifies a raw API key against the stored records and returns the matching
   * ApiKey when it is valid, or `null` otherwise. This path is read-only — it
   * never mutates a row (the `lastUsedAt` touch lives elsewhere).
   *
   * Because `keyHash` is a deterministic SHA-256 digest already used as a unique
   * lookup column, a plain `timingSafeEqual` over the digests is sufficient and
   * appropriate here: it removes the timing side-channel of a naive string
   * compare without the cost of a slow KDF, which would be redundant for a
   * high-entropy random key.
   */
  public async verifyKey(raw: string): Promise<ApiKey | null> {
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }

    const keyHash = apiKeyUtil.hashKey(raw);
    const record = await prismaUtil.client.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (record === null) {
      return null;
    }

    if (!this.hashesMatch(keyHash, record.keyHash)) {
      return null;
    }

    if (record.status !== ApiKeyStatus.ACTIVE) {
      return null;
    }

    if (record.revokedAt !== null) {
      return null;
    }

    if (record.expiresAt !== null && record.expiresAt <= new Date()) {
      return null;
    }

    const { tenant, ...apiKey } = record;

    if (tenant.status !== TenantStatus.ACTIVE) {
      return null;
    }

    return apiKey;
  }

  /**
   * Records that a key was just used by stamping `lastUsedAt` with the current
   * time. This is a best-effort write — callers treat a failure as non-fatal.
   */
  public async touchLastUsed(id: string): Promise<void> {
    await prismaUtil.client.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Atomically records one more request against the usage window identified by
   * (`apiKeyId`, `windowStart`) and returns the resulting `ApiKeyUsage` row.
   *
   * The write is a single `upsert` keyed on the `apiKeyId_windowStart` compound
   * unique constraint: a brand-new window is seeded with `requestCount: 1`, while
   * an existing window is bumped via Prisma's atomic `{ increment: 1 }` operator.
   * Performing the increment in the database — never read-then-write in
   * application code — guarantees that N concurrent calls on an existing window
   * yield exactly +N with no lost updates.
   *
   * `windowStart` is supplied by the caller; this method never computes the
   * current window. Edge case (accepted by design): if two requests race to
   * insert the *first* row for a brand-new window, one may surface a Prisma
   * `P2002` unique-violation. There is intentionally no retry fallback here — the
   * error propagates to the caller.
   */
  public async incrementUsage(
    apiKeyId: string,
    windowStart: Date,
  ): Promise<ApiKeyUsage> {
    return prismaUtil.client.apiKeyUsage.upsert({
      where: { apiKeyId_windowStart: { apiKeyId, windowStart } },
      create: { apiKeyId, windowStart, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
  }

  /**
   * Returns whether `scopes` satisfies every scope in `required`. An empty
   * requirement is always satisfied, and `scopes` holding `ApiKeyScope.ADMIN`
   * bypasses the check entirely; otherwise EVERY required scope must be present.
   */
  public hasRequiredScopes(
    scopes: ApiKeyScope[],
    required: ApiKeyScope[],
  ): boolean {
    if (required.length === 0) {
      return true;
    }

    if (scopes.includes(ApiKeyScope.ADMIN)) {
      return true;
    }

    return required.every((scope) => scopes.includes(scope));
  }

  /**
   * Decides whether a request targeting `requestedBotId` is allowed for a key
   * bound to `boundBotId`, and resolves the effective bot to use downstream.
   *
   * Rules:
   * 1. An unbound key (`boundBotId === null`) is tenant-wide: it passes and the
   *    effective bot is whatever was requested (possibly `null`).
   * 2. A bound key with no requested target passes and injects the bound bot.
   * 3. A bound key whose requested target matches the binding passes.
   * 4. A bound key whose requested target differs is denied.
   *
   * Pure and side-effect free so it can be reused and tested in isolation.
   */
  public resolveBotBinding(
    boundBotId: string | null,
    requestedBotId: string | null,
  ): BotBindingResolution {
    if (boundBotId === null) {
      return { allowed: true, effectiveBotId: requestedBotId };
    }

    if (requestedBotId === null || requestedBotId === boundBotId) {
      return { allowed: true, effectiveBotId: boundBotId };
    }

    return { allowed: false, effectiveBotId: null };
  }

  /**
   * Constant-time comparison of two hex-encoded digests. Returns `false` when
   * the buffers differ in length instead of letting `timingSafeEqual` throw.
   */
  private hashesMatch(computed: string, stored: string): boolean {
    const computedBuffer = Buffer.from(computed, 'hex');
    const storedBuffer = Buffer.from(stored, 'hex');

    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(computedBuffer, storedBuffer);
  }
}

export const apiKeyService = new ApiKeyService();
