import { userService } from '../services/user.service.js';
import { rankingService } from '../services/ranking.service.js';
import { scoringService } from '../services/scoring.service.js';
import { tournamentRepository } from '../repositories/tournament.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { roomRepository } from '../repositories/room.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';

/**
 * Controlador HTTP do Painel Principal do Jogador Autenticado (Dashboard).
 * Centraliza estatísticas de gaming, progresso de nível, convites de salas e torneios recomendados.
 */
export const dashboardController = {
  /**
   * Renderiza a visão geral do Dashboard do competidor.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderDashboard: async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Carregamento concorrente de dados operacionais do competidor
      const [
        userProfile,
        rankCard,
        recentMatchesResult,
        openTournamentsResult,
        pendingInvitations,
        unreadCount,
      ] = await Promise.all([
        userService.getProfile(userId),
        rankingService.getUserRankCard(userId, { period: 'GLOBAL' }),
        quizRepository.findUserHistoryPaginated(userId, { page: 1, limit: 5 }),
        tournamentRepository.findPaginated({
          page: 1,
          limit: 4,
          status: 'REGISTRATION_OPEN',
        }),
        roomRepository.findPendingInvitations(userId),
        notificationRepository.countUnread(userId),
      ]);

      // Calcula detalhadamente a barra de progresso de XP para o próximo nível
      const levelProgress = scoringService.calculateLevelProgress(userProfile.xp);

      res.render('pages/dashboard/index', {
        title: 'Painel do Competidor — Anime Quiz',
        layout: 'layouts/dashboard',
        profile: userProfile,
        levelProgress,
        rankCard,
        recentMatches: recentMatchesResult.history,
        openTournaments: openTournamentsResult.tournaments,
        pendingInvitations,
        unreadNotificationsCount: unreadCount,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default dashboardController;