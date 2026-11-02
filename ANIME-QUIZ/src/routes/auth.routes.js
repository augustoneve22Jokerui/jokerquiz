import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireGuest } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rate-limit.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

// =============================================================================
// ROTAS DE AUTENTICAÇÃO / LOGIN
// =============================================================================

router.get(
  '/login',
  requireGuest,
  authController.renderLogin
);

router.post(
  '/login',
  requireGuest,
  authLimiter,
  csrfProtectionMiddleware,
  validateBody(loginSchema, true),
  authController.handleLogin
);

// =============================================================================
// ROTAS DE REGISTO DE NOVOS JOGADORES
// =============================================================================

router.get(
  '/register',
  requireGuest,
  authController.renderRegister
);

router.post(
  '/register',
  requireGuest,
  authLimiter,
  csrfProtectionMiddleware,
  validateBody(registerSchema, true),
  authController.handleRegister
);

// =============================================================================
// ENCERRAMENTO DE SESSÃO (LOGOUT)
// =============================================================================

router.all(
  '/logout',
  authController.handleLogout
);

// =============================================================================
// RECUPERAÇÃO E REDEFINIÇÃO DE PALAVRA-PASSE
// =============================================================================

router.get(
  '/forgot-password',
  requireGuest,
  authController.renderForgotPassword
);

router.post(
  '/forgot-password',
  requireGuest,
  authLimiter,
  csrfProtectionMiddleware,
  validateBody(forgotPasswordSchema, true),
  authController.handleForgotPassword
);

router.get(
  '/reset-password',
  requireGuest,
  authController.renderResetPassword
);

router.post(
  '/reset-password',
  requireGuest,
  authLimiter,
  csrfProtectionMiddleware,
  validateBody(resetPasswordSchema, true),
  authController.handleResetPassword
);

export default router;