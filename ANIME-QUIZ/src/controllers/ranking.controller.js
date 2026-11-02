import { rankingService } from '../services/ranking.service.js';

/**
 * Controlador HTTP para Visualização das Tabelas de Classificação Competitiva (Leaderboards).
 * Suporta consulta de rankings Globais, Semanais, Mensais e por Nível de Dificuldade,
 * com suporte a alternância dinâmica de abas via Fetch API ou renderização EJS.
 */
export const rankingController = {
  /**
   * Renderiza a página de classificações com suporte a filtros e fixação da posição do jogador.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderRankings: async (req, res, next) => {
    try {
      const period = req.query.period ? String(req.query.period).toUpperCase() : 'GLOBAL';
      const difficulty = req.query.difficulty ? String(req.query.difficulty).toUpperCase() : null;
      const page = parseInt(req.query.page, 10) || 1;

      // Validação defensiva dos parâmetros
      const validPeriods = ['GLOBAL', 'WEEKLY', 'MONTHLY'];
      const validDifficulties = ['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'];

      const resolvedPeriod = validPeriods.includes(period) ? period : 'GLOBAL';
      const resolvedDifficulty = validDifficulties.includes(difficulty) ? difficulty : null;

      // Carrega os dados de classificação e a posição do próprio utilizador (se autenticado)
      const [leaderboardData, userRankCard] = await Promise.all([
        rankingService.getLeaderboard({
          period: resolvedPeriod,
          difficulty: resolvedDifficulty,
          page,
          limit: 50,
        }),
        req.user
          ? rankingService.getUserRankCard(req.user.id, {
              period: resolvedPeriod,
              difficulty: resolvedDifficulty,
            })
          : Promise.resolve(null),
      ]);

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          period: resolvedPeriod,
          periodIdentifier: leaderboardData.periodIdentifier,
          difficulty: resolvedDifficulty,
          rankings: leaderboardData.rankings,
          userRankCard,
        });
      }

      res.render('pages/rankings/index', {
        title: 'Classificações Competitivas — Anime Quiz',
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        rankings: leaderboardData.rankings,
        period: resolvedPeriod,
        periodIdentifier: leaderboardData.periodIdentifier,
        difficulty: resolvedDifficulty,
        currentPage: page,
        userRankCard,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Endpoint de API dedicado para alternância rápida de abas de classificação sem recarregamento de página.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  getLeaderboardJson: async (req, res, next) => {
    try {
      const period = req.query.period ? String(req.query.period).toUpperCase() : 'GLOBAL';
      const difficulty = req.query.difficulty ? String(req.query.difficulty).toUpperCase() : null;
      const page = parseInt(req.query.page, 10) || 1;

      const leaderboardData = await rankingService.getLeaderboard({
        period,
        difficulty,
        page,
        limit: 50,
      });

      const userRankCard = req.user
        ? await rankingService.getUserRankCard(req.user.id, { period, difficulty })
        : null;

      res.status(200).json({
        success: true,
        period,
        periodIdentifier: leaderboardData.periodIdentifier,
        difficulty,
        rankings: leaderboardData.rankings,
        userRankCard,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default rankingController;