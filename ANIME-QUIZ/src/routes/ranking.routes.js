import { Router } from 'express';
import { rankingController } from '../controllers/ranking.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// =============================================================================
// ROTAS DE CLASSIFICAÇÃO COMPETITIVA (LEADERBOARDS)
// =============================================================================

/**
 * Renderiza a página principal de tabelas de classificação (Global, Semanal, Mensal e Dificuldades).
 * Utiliza optionalAuth para personalizar a experiência destacando a colocação do jogador autenticado.
 */
router.get(
  '/',
  optionalAuth,
  rankingController.renderRankings
);

/**
 * Endpoint de API para alternância dinâmica de abas de classificação sem recarregamento de página.
 */
router.get(
  '/api/leaderboard',
  optionalAuth,
  rankingController.getLeaderboardJson
);

export default router;