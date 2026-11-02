import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireAdmin, requireModerator } from '../middlewares/role.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import {
  manageUserStatusSchema,
  assignUserRoleSchema,
  createQuestionSchema,
  resolveReportSchema,
} from '../validators/admin.validator.js';
import { createTournamentSchema } from '../validators/tournament.validator.js';

const router = Router();

// =============================================================================
// VISÃO GERAL (DASHBOARD ADMINISTRATIVO)
// =============================================================================

router.get(
  '/',
  requireAuth,
  requireModerator,
  adminController.renderDashboard
);

// =============================================================================
// GESTÃO DE UTILIZADORES E PAPÉIS (EXCLUSIVO ADMIN MASTER)
// =============================================================================

router.get(
  '/users',
  requireAuth,
  requireAdmin,
  adminController.renderUsers
);

router.post(
  '/users/status',
  requireAuth,
  requireAdmin,
  csrfProtectionMiddleware,
  validateBody(manageUserStatusSchema, false),
  adminController.handleUpdateUserStatus
);

router.post(
  '/users/role',
  requireAuth,
  requireAdmin,
  csrfProtectionMiddleware,
  validateBody(assignUserRoleSchema, false),
  adminController.handleAssignRole
);

// =============================================================================
// FILA DE MODERAÇÃO DE PAGAMENTOS (AOA)
// =============================================================================

router.get(
  '/payments',
  requireAuth,
  requireModerator,
  adminController.renderPayments
);

// =============================================================================
// GESTÃO DE TORNEIOS E CHAVES ELIMINATÓRIAS
// =============================================================================

router.get(
  '/tournaments',
  requireAuth,
  requireModerator,
  adminController.renderTournaments
);

router.post(
  '/tournaments/create',
  requireAuth,
  requireModerator,
  csrfProtectionMiddleware,
  validateBody(createTournamentSchema, true),
  adminController.handleCreateTournament
);

router.post(
  '/tournaments/generate-brackets',
  requireAuth,
  requireModerator,
  adminController.handleGenerateBrackets
);

// =============================================================================
// BANCO DE PERGUNTAS E RESPOSTAS DO QUIZ
// =============================================================================

router.get(
  '/questions',
  requireAuth,
  requireModerator,
  adminController.renderQuestions
);

router.post(
  '/questions/create',
  requireAuth,
  requireModerator,
  csrfProtectionMiddleware,
  validateBody(createQuestionSchema, true),
  adminController.handleCreateQuestion
);

// =============================================================================
// MODERAÇÃO DE DENÚNCIAS DA COMUNIDADE (REPORTS)
// =============================================================================

router.get(
  '/reports',
  requireAuth,
  requireModerator,
  adminController.renderReports
);

router.post(
  '/reports/resolve',
  requireAuth,
  requireModerator,
  csrfProtectionMiddleware,
  validateBody(resolveReportSchema, false),
  adminController.handleResolveReport
);

// =============================================================================
// AUDITORIA FORENSE DE OPERAÇÕES ADMINISTRATIVAS (EXCLUSIVO ADMIN MASTER)
// =============================================================================

router.get(
  '/audit-logs',
  requireAuth,
  requireAdmin,
  adminController.renderAuditLogs
);

export default router;