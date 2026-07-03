import { Router } from 'express';
import { apiKeyController } from '../controllers';
import { requestValidatorMiddleware } from '../middlewares';
import { responseHandlerUtil } from '../utils';
import { createApiKeySchema } from '../validators';

const router: Router = Router({ mergeParams: true });

router.post(
  '/',
  requestValidatorMiddleware.handle({
    target: 'body',
    schema: createApiKeySchema,
  }),
  responseHandlerUtil.handle(apiKeyController.handleCreate),
);

router.get('/', responseHandlerUtil.handle(apiKeyController.handleList));

export default router;
