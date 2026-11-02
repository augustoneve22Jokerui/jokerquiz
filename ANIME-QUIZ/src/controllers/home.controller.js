import { tournamentRepository } from '../repositories/tournament.repository.js';
import { rankingRepository } from '../repositories/ranking.repository.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';

/**
 * Controlador HTTP para Páginas Públicas e Institucionais do Ecossistema.
 * Gere a Landing Page com métricas em tempo real, regulamentos e catálogo de animes.
 */
export const homeController = {
  /**
   * Renderiza a página principal (Landing Page).
   * Apresenta torneios abertos em destaque, pódio dos líderes do ranking e categorias activas.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderHome: async (req, res, next) => {
    try {
      // Carrega dados dinâmicos da plataforma de forma concorrente
      const [tournamentsResult, topRankings, categories, animesResult] = await Promise.all([
        tournamentRepository.findPaginated({
          page: 1,
          limit: 3,
          status: 'REGISTRATION_OPEN',
        }),
        rankingRepository.getLeaderboard({
          period: 'GLOBAL',
          periodIdentifier: 'ALL_TIME',
          limit: 5,
        }),
        animeRepository.findAllCategories(true),
        animeRepository.findPaginated({
          page: 1,
          limit: 6,
          onlyActive: true,
        }),
      ]);

      res.render('pages/public/index', {
        title: 'Anime Quiz — O Ecossistema Competitivo de Anime Gaming',
        layout: 'layouts/main',
        featuredTournaments: tournamentsResult.tournaments,
        topRankings,
        categories,
        featuredAnimes: animesResult.animes,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página "Sobre Nós" / Visão do Ecossistema.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderAbout: (req, res) => {
    res.render('pages/public/about', {
      title: 'Sobre o Ecossistema — Anime Quiz Gaming',
      layout: 'layouts/main',
    });
  },

  /**
   * Renderiza a página de Regulamento e Regras Competitivas.
   * Explica o funcionamento dos 4 níveis (Iniciante, Médio, Profissional e Hokage),
   * os critérios anti-cheat e as diretrizes de integridade de partidas.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderRules: (req, res) => {
    res.render('pages/public/rules', {
      title: 'Regulamento Competitivo & Sistema Anti-Cheat — Anime Quiz',
      layout: 'layouts/main',
    });
  },

  /**
   * Renderiza o catálogo público de animes integrados no catálogo de perguntas.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderAnimes: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const search = req.query.search ? String(req.query.search).trim() : '';

      const { animes, total, totalPages } = await animeRepository.findPaginated({
        page,
        limit: 12,
        search,
        onlyActive: true,
      });

      res.render('pages/public/animes', {
        title: 'Catálogo de Universos de Anime — Anime Quiz',
        layout: 'layouts/main',
        animes,
        currentPage: page,
        totalPages,
        totalAnimes: total,
        search,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default homeController;