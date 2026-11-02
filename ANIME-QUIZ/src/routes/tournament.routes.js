import { Router } from 'express';
import { tournamentController } from '../controllers/tournament.controller.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import { registerTournamentSchema } from '../validators/tournament.validator.js';

const router = Router();

// =============================================================================
// CATÁLOGO E DETALHES DE TORNEIOS
// =============================================================================

/**
 * Listagem pública de torneios competitivos (abertos, em andamento e concluídos).
 */
router.get(
  '/',
  optionalAuth,
  tournamentController.renderList
);

/**
 * Visualização detalhada de um torneio específico por Slug ou UUID.
 */
router.get(
  '/:slugOrId',
  optionalAuth,
  tournamentController.renderDetails
);

// =============================================================================
// INSCRIÇÃO E FLUXO DE PAGAMENTO (AOA)
// =============================================================================

/**
 * Processa a solicitação de inscrição do competidor no torneio.
 */
router.post(
  '/register',
  requireAuth,
  csrfProtectionMiddleware,
  validateBody(registerTournamentSchema, true),
  tournamentController.handleRegister
);

/**
 * Instruções de pagamento e transferência bancária/Multicaixa Express para torneios pagos.
 */
router.get(
  '/:id/payment',
  requireAuth,
  tournamentController.renderPayment
);

// =============================================================================
// CHAVE ELIMINATÓRIA (BRACKETS)
// =============================================================================

/**
 * Visualização da árvore e duelos das eliminatórias do torneio.
 */
router.get(
  '/:id/bracket',
  optionalAuth,
  tournamentController.renderBracket
);

export default router;