import { animeRepository } from '../repositories/anime.repository.js';
import { jikanService } from '../services/jikan.service.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para o Catálogo de Animes, Personagens e Integração com a API Jikan (MyAnimeList).
 * Centraliza as consultas do catálogo e o autocomplete de títulos para o banco de perguntas.
 */
export const animeController = {
  /**
   * Renderiza a página de detalhes de um anime específico com os seus personagens associados.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderDetails: async (req, res, next) => {
    try {
      const { slugOrId } = req.params;

      const isNumeric = /^\d+$/.test(slugOrId);
      const anime = isNumeric
        ? await animeRepository.findById(parseInt(slugOrId, 10))
        : await animeRepository.findBySlug(slugOrId);

      if (!anime) {
        throw new AppError('Anime não encontrado no catálogo.', 404, 'ANIME_NOT_FOUND');
      }

      const characters = await animeRepository.findCharactersByAnimeId(anime.id);

      res.render('pages/public/anime-details', {
        title: `${anime.title} — Anime Quiz`,
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        anime,
        characters,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Endpoint de API para pesquisa dinâmica de animes (Autocomplete em formulários administrativos).
   * Consulta a base local e consome a Jikan API para novas descobertas sob demanda.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  searchAnimeJson: async (req, res, next) => {
    try {
      const queryText = req.query.q ? String(req.query.q).trim() : '';

      if (!queryText || queryText.length < 2) {
        return res.status(200).json({ success: true, animes: [] });
      }

      // 1. Tenta encontrar primeiro no catálogo local em PostgreSQL
      const localResults = await animeRepository.findPaginated({
        page: 1,
        limit: 8,
        search: queryText,
        onlyActive: true,
      });

      if (localResults.animes.length > 0) {
        return res.status(200).json({
          success: true,
          source: 'cache',
          animes: localResults.animes,
        });
      }

      // 2. Caso não exista localmente, consome a API oficial da Jikan e efectua cache automática
      const remoteAnimes = await jikanService.searchAnime(queryText, 6);

      res.status(200).json({
        success: true,
        source: 'jikan_api',
        animes: remoteAnimes,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Endpoint administrativo para forçar a sincronização de um anime específico via ID MyAnimeList.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  syncAnimeByMalId: async (req, res, next) => {
    try {
      const { malId } = req.body;

      if (!malId || isNaN(parseInt(malId, 10))) {
        throw new AppError('O ID oficial da MyAnimeList (malId) é obrigatório.', 400, 'INVALID_MAL_ID');
      }

      const anime = await jikanService.getAnimeByMalId(parseInt(malId, 10));

      res.status(200).json({
        success: true,
        message: `Anime "${anime.title}" sincronizado com sucesso.`,
        anime,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retorna a lista de todas as categorias temáticas activas em formato JSON para selects e filtros.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  getCategoriesJson: async (req, res, next) => {
    try {
      const categories = await animeRepository.findAllCategories(true);

      res.status(200).json({
        success: true,
        categories,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default animeController;