import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireModerator } from '../middlewares/role.middleware.js';

const router = Router();

// =============================================================================
// ROTAS DE CHAT EM TEMPO REAL E COMUNIDADE
// =============================================================================

/**
 * Renderiza a interface do canal de Chat Global da Comunidade.
 */
router.get(
  '/',
  requireAuth,
  chatController.renderGlobalChat
);

/**
 * Envia uma mensagem via requisição HTTP (suporte com fallback ao WebSocket).
 */
router.post(
  '/message',
  requireAuth,
  chatController.handleSendMessage
);

/**
 * Retorna o histórico de mensagens recente de uma conversação específica.
 */
router.get(
  '/history/:conversationId',
  requireAuth,
  chatController.handleGetHistory
);

// =============================================================================
// MODERAÇÃO DE CONDUTA NO CHAT (STAFF RBAC)
// =============================================================================

/**
 * Oculta uma mensagem por infração das regras comunitárias (Soft Delete).
 */
router.post(
  '/moderate',
  requireAuth,
  requireModerator,
  chatController.handleModerateMessage
);

/**
 * Aplica sanção de silêncio (Mute) a um jogador que desrespeitou as diretrizes.
 */
router.post(
  '/mute',
  requireAuth,
  requireModerator,
  chatController.handleMutePlayer
);

export default router;