import { Router } from 'express';
import { profileController } from '../controllers/profile.controller.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { uploadLimiter } from '../middlewares/rate-limit.middleware.js';
import { handleAvatarUpload } from '../middlewares/upload.middleware.js';
import { validateBody, validateParams } from '../middlewares/validation.middleware.js';
import {
  updateProfileSchema,
  selectAvatarSchema,
  usernameParamSchema,
} from '../validators/user.validator.js';

const router = Router();

// =============================================================================
// ROTAS DE PERFIL PESSOAL DO COMPETIDOR (AUTENTICADO)
// =============================================================================

router.get(
  '/',
  requireAuth,
  profileController.renderProfile
);

router.get(
  '/edit',
  requireAuth,
  profileController.renderEditProfile
);

router.post(
  '/edit',
  requireAuth,
  csrfProtectionMiddleware,
  validateBody(updateProfileSchema, true),
  profileController.handleUpdateProfile
);

// =============================================================================
// PERSONALIZAÇÃO DE AVATAR (UPLOAD LOCAL & GALERIA OFICIAL)
// =============================================================================

router.post(
  '/avatar',
  requireAuth,
  uploadLimiter,
  handleAvatarUpload('avatar'),
  profileController.handleUpdateAvatar
);

router.post(
  '/avatar/select',
  requireAuth,
  csrfProtectionMiddleware,
  validateBody(selectAvatarSchema, true),
  profileController.handleUpdateAvatar
);

// =============================================================================
// HISTÓRICO DE PARTIDAS E ESTATÍSTICAS
// =============================================================================

router.get(
  '/history',
  requireAuth,
  profileController.renderMatchHistory
);

// =============================================================================
// PERFIL PÚBLICO DE JOGADORES (ACESSO LIVRE POR USERNAME)
// =============================================================================

router.get(
  '/u/:username',
  optionalAuth,
  validateParams(usernameParamSchema),
  profileController.renderPublicProfile
);

export default router;