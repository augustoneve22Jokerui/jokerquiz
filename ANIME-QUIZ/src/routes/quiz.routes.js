import { Router } from 'express';
import { quizController } from '../controllers/quiz.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { quizAnswerLimiter } from '../middlewares/rate-limit.middleware.js';
import { validateBody, validateParams } from '../middlewares/validation.middleware.js';
import {
  startQuizSessionSchema,
  submitAnswerSchema,
  quizSessionParamSchema,
} from '../validators/quiz.validator.js';

const router = Router();

// =============================================================================
// ROTAS DO MOTOR DE QUIZ INDIVIDUAL (TREINO E RANQUEADO)
// =============================================================================

/**
 * Lobby inicial para selecção de modo (Treino vs Ranqueado), dificuldade e categoria.
 */
router.get(
  '/',
  requireAuth,
  quizController.renderLobby
);

/**
 * Inicializa a sessão de jogo e gera as perguntas seguras sem gabarito.
 */
router.post(
  '/start',
  requireAuth,
  validateBody(startQuizSessionSchema, true),
  quizController.handleStartSession
);

/**
 * Interface imersiva da partida individual (HUD fullscreen).
 */
router.get(
  '/play/:id',
  requireAuth,
  validateParams(quizSessionParamSchema),
  quizController.renderPlay
);

/**
 * Submissão assíncrona de resposta com protecção anti-spam e cronómetro no servidor.
 */
router.post(
  '/submit-answer',
  requireAuth,
  quizAnswerLimiter,
  validateBody(submitAnswerSchema, false),
  quizController.handleSubmitAnswer
);

/**
 * Ecrã consolidado de resultados finais da partida.
 */
router.get(
  '/result/:id',
  requireAuth,
  validateParams(quizSessionParamSchema),
  quizController.renderResult
);

export default router;