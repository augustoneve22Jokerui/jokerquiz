import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// =============================================================================
// ROTA PRINCIPAL DO PAINEL DO COMPETIDOR (DASHBOARD)
// =============================================================================

/**
 * Rota protegida: exige sessão activa do jogador.
 * Carrega indicadores de progresso, status do ranking, convites activos e torneios recomendados.
 */
router.get(
  '/',
  requireAuth,
  dashboardController.renderDashboard
);

export default router;