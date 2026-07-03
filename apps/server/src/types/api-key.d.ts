import type { ApiKey } from '@prisma/client';

export interface GeneratedApiKey {
  raw: string;
  keyHash: string;
  keyPrefix: string;
}

export interface BotBindingResolution {
  allowed: boolean;
  effectiveBotId: string | null;
}

/**
 * An ApiKey row safe to serialize over HTTP: it is the persisted model with the
 * secret `keyHash` column omitted so the hash never leaves the service layer.
 */
export type ApiKeySummary = Omit<ApiKey, 'keyHash'>;

/**
 * The result of minting a key: the serializable `apiKey` summary plus the raw
 * `key` secret, which is exposed exactly once at creation and never persisted or
 * returned again.
 */
export interface CreatedApiKey {
  apiKey: ApiKeySummary;
  key: string;
}
