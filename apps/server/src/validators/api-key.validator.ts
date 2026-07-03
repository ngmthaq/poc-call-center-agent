import { ApiKeyScope } from '@prisma/client';
import * as yup from 'yup';
import type { InferType } from 'yup';

export const createApiKeySchema = yup.object({
  name: yup.string().trim().required('name is required'),
  scopes: yup
    .array()
    .of(
      yup
        .mixed<ApiKeyScope>()
        .oneOf(Object.values(ApiKeyScope), 'scope is invalid')
        .required(),
    )
    .min(1, 'at least one scope is required')
    .required('scopes is required'),
  expiresAt: yup
    .date()
    .test(
      'future',
      'expiresAt must be in the future',
      (value) => value === undefined || value.getTime() > Date.now(),
    ),
});

export type CreateApiKeyBody = InferType<typeof createApiKeySchema>;
