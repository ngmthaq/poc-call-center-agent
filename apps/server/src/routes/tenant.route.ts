import { Router } from 'express';
import { tenantController } from '../controllers';
import {
  adminAuthMiddleware,
  requestValidatorMiddleware,
} from '../middlewares';
import { responseHandlerUtil } from '../utils';
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
} from '../validators';
import apiKeyRouter from './api-key.route';

const router: Router = Router();

router.use(adminAuthMiddleware.handle);

router.post(
  '/',
  requestValidatorMiddleware.handle({
    target: 'body',
    schema: createTenantSchema,
  }),
  responseHandlerUtil.handle(tenantController.handleCreate),
);

router.get(
  '/',
  requestValidatorMiddleware.handle({
    target: 'query',
    schema: listTenantsQuerySchema,
  }),
  responseHandlerUtil.handle(tenantController.handleList),
);

router.get('/:id', responseHandlerUtil.handle(tenantController.handleGet));

router.patch(
  '/:id',
  requestValidatorMiddleware.handle({
    target: 'body',
    schema: updateTenantSchema,
  }),
  responseHandlerUtil.handle(tenantController.handleUpdate),
);

router.delete(
  '/:id',
  responseHandlerUtil.handle(tenantController.handleDelete),
);

router.use('/:id/keys', apiKeyRouter);

export default router;
