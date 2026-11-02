import { Router } from 'express';
import { animeController } from '../controllers/anime.controller.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware.js';
import { requireModerator } from '../middlewares/role.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// =============================================================================
// CATÁLOGO DE ANIMES, PESQUISA E CATEGORIAS TEMÁTICAS
// =============================================================================

/**
 * Retorna a lista de categorias temáticas activas em formato JSON para selects e filtros.
 */
router.get(
  '/categories',
  optionalAuth,
  animeController.getCategoriesJson
);

/**
 * Pesquisa dinâmica de animes por termo com cache local e integração com a Jikan API.
 * Protegida por rate limiter de APIs para evitar sobrecarga de consultas.
 */
router.get(
  '/search',
  optionalAuth,
  apiLimiter,
  animeController.searchAnimeJson
);

/**
 * Sincronização forçada de metadados de anime via ID oficial MyAnimeList (Jikan API).
 * Acesso restrito a moderadores e administradores.
 */
router.post(
  '/sync',
  requireAuth,
  requireModerator,
  animeController.syncAnimeByMalId
);

/**
 * Detalhes de um anime específico e dos seus personagens associados.
 */
router.get(
  '/:slugOrId',
  optionalAuth,
  animeController.renderDetails
);

export default router;