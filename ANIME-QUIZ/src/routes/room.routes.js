import { Router } from 'express';
import { roomController } from '../controllers/room.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { validateBody, validateParams } from '../middlewares/validation.middleware.js';
import {
  createRoomSchema,
  joinRoomByCodeSchema,
  roomInviteSchema,
  roomCodeParamSchema,
} from '../validators/room.validator.js';

const router = Router();

// =============================================================================
// LISTAGEM E CRIAÇÃO DE SALAS MULTIPLAYER
// =============================================================================

router.get(
  '/',
  requireAuth,
  roomController.renderList
);

router.get(
  '/create',
  requireAuth,
  roomController.renderCreate
);

router.post(
  '/create',
  requireAuth,
  csrfProtectionMiddleware,
  validateBody(createRoomSchema, true),
  roomController.handleCreate
);

// =============================================================================
// ADESÃO E ENTRADA EM SALAS
// =============================================================================

router.post(
  '/join',
  requireAuth,
  csrfProtectionMiddleware,
  validateBody(joinRoomByCodeSchema, true),
  roomController.handleJoinByCode
);

router.get(
  '/lobby/:code',
  requireAuth,
  validateParams(roomCodeParamSchema),
  roomController.renderLobby
);

// =============================================================================
// ARENA DE JOGO MULTIPLAYER EM TEMPO REAL
// =============================================================================

router.get(
  '/arena/:code',
  requireAuth,
  validateParams(roomCodeParamSchema),
  roomController.renderArena
);

// =============================================================================
// CONVITES DIRECTOS ENTRE JOGADORES
// =============================================================================

router.post(
  '/invite',
  requireAuth,
  validateBody(roomInviteSchema, false),
  roomController.handleInvite
);

export default router;