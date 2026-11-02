import { withTransaction } from '../database/connection.js';
import { rankingRepository } from '../repositories/ranking.repository.js';
import { achievementRepository } from '../repositories/achievement.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { getIsoWeekIdentifier, getIsoMonthIdentifier } from '../utils/date.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio do Sistema de Classificações Competitivas (Leaderboards).
 * Gere a consolidação de pontos em múltiplas dimensões (Global, Semanal, Mensal e por Dificuldade).
 */
export const rankingService = {
  /**
   * Consulta a tabela de classificação de acordo com o período e critérios solicitados.
   * Resolve automaticamente os identificadores cronológicos (ex: '2026-W44', '2026-11').
   * 
   * @param {Object} options
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} [options.period='GLOBAL']
   * @param {string|null} [options.periodIdentifier=null]
   * @param {string|null} [options.difficulty=null]
   * @param {number} [options.page=1]
   * @param {number} [options.limit=50]
   * @returns {Promise<{ rankings: Array<Object>, period: string, periodIdentifier: string, page: number }>}
   */
  getLeaderboard: async ({
    period = 'GLOBAL',
    periodIdentifier = null,
    difficulty = null,
    page = 1,
    limit = 50,
  }) => {
    // Resolve o identificador temporal canónico
    let resolvedIdentifier = periodIdentifier;
    if (!resolvedIdentifier) {
      if (period === 'GLOBAL') {
        resolvedIdentifier = 'ALL_TIME';
      } else if (period === 'WEEKLY') {
        resolvedIdentifier = getIsoWeekIdentifier();
      } else if (period === 'MONTHLY') {
        resolvedIdentifier = getIsoMonthIdentifier();
      }
    }

    const offset = (page - 1) * limit;

    const rankings = await rankingRepository.getLeaderboard({
      period,
      periodIdentifier: resolvedIdentifier,
      difficulty,
      limit,
      offset,
    });

    return {
      rankings,
      period,
      periodIdentifier: resolvedIdentifier,
      difficulty,
      page,
    };
  },

  /**
   * Obtém a ficha de classificação de um utilizador em determinado ranking.
   * 
   * @param {string} userId - UUID
   * @param {Object} [options]
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} [options.period='GLOBAL']
   * @param {string|null} [options.difficulty=null]
   * @returns {Promise<Object|null>}
   */
  getUserRankCard: async (userId, { period = 'GLOBAL', difficulty = null } = {}) => {
    let resolvedIdentifier = 'ALL_TIME';
    if (period === 'WEEKLY') {
      resolvedIdentifier = getIsoWeekIdentifier();
    } else if (period === 'MONTHLY') {
      resolvedIdentifier = getIsoMonthIdentifier();
    }

    return await rankingRepository.getUserRankCard(userId, {
      period,
      periodIdentifier: resolvedIdentifier,
      difficulty,
    });
  },

  /**
   * Credita os pontos de uma partida competitiva em todas as dimensões de ranking aplicáveis:
   * 1. Ranking Geral Perpétuo ('GLOBAL', 'ALL_TIME');
   * 2. Ranking Semanal Corrente ('WEEKLY', 'AAAA-WXX');
   * 3. Ranking Mensal Corrente ('MONTHLY', 'AAAA-MM');
   * 4. Ranking Segmentado pela Dificuldade jogada ('GLOBAL', 'ALL_TIME', difficulty).
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} data.difficulty
   * @param {number} data.scoreEarned
   * @param {number} data.xpEarned
   * @param {boolean} data.isWin
   * @returns {Promise<void>}
   */
  recordMatchPoints: async ({
    userId,
    difficulty,
    scoreEarned,
    xpEarned,
    isWin,
  }) => {
    if (scoreEarned <= 0 && xpEarned <= 0) return;

    const currentWeek = getIsoWeekIdentifier();
    const currentMonth = getIsoMonthIdentifier();

    await withTransaction(async (client) => {
      // 1. Dimensão: Global Geral
      await rankingRepository.upsertUserRanking(
        {
          userId,
          period: 'GLOBAL',
          periodIdentifier: 'ALL_TIME',
          difficulty: null,
          scoreDelta: scoreEarned,
          xpDelta: xpEarned,
          isWin,
        },
        client
      );

      // 2. Dimensão: Semanal
      await rankingRepository.upsertUserRanking(
        {
          userId,
          period: 'WEEKLY',
          periodIdentifier: currentWeek,
          difficulty: null,
          scoreDelta: scoreEarned,
          xpDelta: xpEarned,
          isWin,
        },
        client
      );

      // 3. Dimensão: Mensal
      await rankingRepository.upsertUserRanking(
        {
          userId,
          period: 'MONTHLY',
          periodIdentifier: currentMonth,
          difficulty: null,
          scoreDelta: scoreEarned,
          xpDelta: xpEarned,
          isWin,
        },
        client
      );

      // 4. Dimensão: Segmentada pela Dificuldade
      if (difficulty) {
        await rankingRepository.upsertUserRanking(
          {
            userId,
            period: 'GLOBAL',
            periodIdentifier: 'ALL_TIME',
            difficulty,
            scoreDelta: scoreEarned,
            xpDelta: xpEarned,
            isWin,
          },
          client
        );
      }

      // Recalcula as colocações relativas nas dimensões activas
      await Promise.all([
        rankingRepository.recalculatePositions('GLOBAL', 'ALL_TIME', null, client),
        rankingRepository.recalculatePositions('WEEKLY', currentWeek, null, client),
        rankingRepository.recalculatePositions('MONTHLY', currentMonth, null, client),
        difficulty ? rankingRepository.recalculatePositions('GLOBAL', 'ALL_TIME', difficulty, client) : Promise.resolve(),
      ]);
    });

    logger.debug(`Pontos de ranking computados: User=${userId} | Score=+${scoreEarned} | Dificuldade=${difficulty}`);
  },

  /**
   * Consolida o fecho de um período (Semanal ou Mensal), gravando instantâneos (Snapshots)
   * dos melhores classificados e concedendo as distinções honorárias da temporada.
   * 
   * @param {'WEEKLY' | 'MONTHLY'} period
   * @param {string} periodIdentifier
   * @returns {Promise<number>} Quantidade de jogadores imortalizados no snapshot
   */
  snapshotPeriodicRankings: async (period, periodIdentifier) => {
    return await withTransaction(async (client) => {
      const topPlayers = await rankingRepository.getLeaderboard(
        {
          period,
          periodIdentifier,
          difficulty: null,
          limit: 10, // Top 10 oficial
          offset: 0,
        },
        client
      );

      if (topPlayers.length === 0) return 0;

      for (let i = 0; i < topPlayers.length; i++) {
        const player = topPlayers[i];
        const finalPosition = i + 1;

        // Se for o 1º Lugar do Ranking Mensal, concede a medalha lendária dos Quatro Imperadores
        if (period === 'MONTHLY' && finalPosition === 1) {
          const yonkoMedal = await achievementRepository.findByMedalCode('TOP_RANKING_SEASON', client);
          if (yonkoMedal) {
            await achievementRepository.awardMedal(player.user_id, yonkoMedal.id, null, client);
          }

          await notificationRepository.create(
            {
              userId: player.user_id,
              title: 'Lenda da Temporada!',
              message: `Parabéns! Concluiu o mês de ${periodIdentifier} como o Top 1 do Ranking Global e recebeu a Insígnia dos Quatro Imperadores!`,
              type: 'ACHIEVEMENT',
              link: '/rankings',
            },
            client
          );
        }

        await rankingRepository.createSnapshot(
          {
            period,
            periodIdentifier,
            userId: player.user_id,
            finalPosition,
            score: player.score,
            xp: player.xp,
            wins: player.wins,
            rewardsGranted: { position: finalPosition, period, periodIdentifier },
          },
          client
        );
      }

      logger.info(`Snapshot consolidado com sucesso: ${period} (${periodIdentifier}) com ${topPlayers.length} classificados.`);
      return topPlayers.length;
    });
  },
};

export default rankingService;