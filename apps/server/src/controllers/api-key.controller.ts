import type { RequestHandler } from 'express';
import createHttpError from 'http-errors';
import { errorMessages } from '../configs';
import { apiKeyService } from '../services';
import type { CreateApiKeyBody } from '../validators';

export class ApiKeyController {
  /**
   * Handles `POST /admin/tenants/:id/keys`. Mints a key for the tenant and
   * returns `{ apiKey, key }` wrapped with a 201, exposing the raw `key` exactly
   * once. A missing tenant yields a 404.
   */
  public readonly handleCreate: RequestHandler = async (req, res) => {
    const created = await apiKeyService.createForTenant(
      req.params.id as string,
      req.body as CreateApiKeyBody,
    );

    if (created === null) {
      throw createHttpError(404, errorMessages.tenantNotFound());
    }

    res.status(201);
    return created;
  };

  /**
   * Handles `GET /admin/tenants/:id/keys`. Returns `{ items }` listing the
   * tenant's keys by prefix only, wrapped with a 200; a missing tenant yields a
   * 404.
   */
  public readonly handleList: RequestHandler = async (req) => {
    const keys = await apiKeyService.listForTenant(req.params.id as string);

    if (keys === null) {
      throw createHttpError(404, errorMessages.tenantNotFound());
    }

    return { items: keys };
  };
}

export const apiKeyController = new ApiKeyController();
