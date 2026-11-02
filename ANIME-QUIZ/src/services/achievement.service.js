import { withTransaction } from '../database/connection.js';
import { achievementRepository } from '../repositories/achievement.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { scoringService } from './scoring.service.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio para Avaliação de Conquistas (Achievements), Desbloqueios e Medalhas.
 * Analisa o histórico e desempenho dos competidores, concedendo XP e insígnias honorárias.
 */
export const achievementService = {
  /**
   * Avalia os critérios de conquistas após uma partida (Solo Ranqueada ou Multiplayer):
   * - Total de vitórias acumuladas (WINS_COUNT);
   * - Precisão cirúrgica de 100% de acertos (PERFECT_SCORE);
   * - Sequência invicta na dificuldade suprema (HOKAGE_STREAK).
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {boolean} data.isWin
   * @param {number} data.accuracyPercentage - Precisão (0 a 100)
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} data.difficulty
   * @param {number} [data.currentStreak=0]
   * @returns {Promise<Array<Object>>} Lista de conquistas recém-desbloqueadas nesta execução
   */
  evaluateMatchAchievements: async ({
    userId,
    isWin,
    accuracyPercentage,
    difficulty,
    currentStreak = 0,
  }) => {
    return await withTransaction(async (client) => {
      const newlyUnlocked = [];

      // 1. Carrega dados de perfil do competidor
      const profile = await profileRepository.findByUserId(userId, client);
      if (!profile) return [];

      // -----------------------------------------------------------------------
      // CRITÉRIO: CONTAGEM DE VITÓRIAS (WINS_COUNT)
      // -----------------------------------------------------------------------
      if (isWin) {
        const eligibleWinAchievements = await achievementRepository.findEligibleAchievements(
          'WINS_COUNT',
          profile.matches_won,
          client
        );

        for (const ach of eligibleWinAchievements) {
          const unlocked = await achievementRepository.unlockAchievement(userId, ach.id, client);
          if (unlocked) {
            newlyUnlocked.push(ach);
            await achievementService.creditAchievementReward(userId, ach, client);
          }
        }
      }

      // -----------------------------------------------------------------------
      // CRITÉRIO: PRECISÃO PERFEITA DE 100% (PERFECT_SCORE)
      // -----------------------------------------------------------------------
      if (accuracyPercentage >= 100) {
        const eligibleScoreAchievements = await achievementRepository.findEligibleAchievements(
          'PERFECT_SCORE',
          1,
          client
        );

        for (const ach of eligibleScoreAchievements) {
          const unlocked = await achievementRepository.unlockAchievement(userId, ach.id, client);
          if (unlocked) {
            newlyUnlocked.push(ach);
            await achievementService.creditAchievementReward(userId, ach, client);
          }
        }
      }

      // -----------------------------------------------------------------------
      // CRITÉRIO: SEQUÊNCIA INVICTA NA DIFICULDADE HOKAGE (HOKAGE_STREAK)
      // -----------------------------------------------------------------------
      if (difficulty === 'HOKAGE' && isWin && currentStreak >= 5) {
        const eligibleHokageAchievements = await achievementRepository.findEligibleAchievements(
          'HOKAGE_STREAK',
          currentStreak,
          client
        );

        for (const ach of eligibleHokageAchievements) {
          const unlocked = await achievementRepository.unlockAchievement(userId, ach.id, client);
          if (unlocked) {
            newlyUnlocked.push(ach);
            await achievementService.creditAchievementReward(userId, ach, client);
          }
        }
      }

      return newlyUnlocked;
    });
  },

  /**
   * Concede a conquista máxima de campeão de torneio eliminatório ao vencedor.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  grantTournamentChampionAchievement: async (userId, client = null) => {
    const championAch = await achievementRepository.findByCode('TOURNAMENT_CHAMPION', client);
    if (!championAch) return null;

    const unlocked = await achievementRepository.unlockAchievement(userId, championAch.id, client);
    if (unlocked) {
      await achievementService.creditAchievementReward(userId, championAch, client);
      return championAch;
    }
    return null;
  },

  /**
   * Credita a recompensa de XP concedida pela conquista e envia notificação ao jogador.
   * 
   * @param {string} userId - UUID
   * @param {Object} achievement - Dados da conquista
   * @param {import('pg').PoolClient} client
   * @returns {Promise<void>}
   */
  creditAchievementReward: async (userId, achievement, client) => {
    const xpReward = achievement.xp_reward || 0;

    if (xpReward > 0) {
      const profile = await profileRepository.findByUserId(userId, client);
      if (profile) {
        const newTotalXp = parseInt(profile.xp, 10) + xpReward;
        const progress = scoringService.calculateLevelProgress(newTotalXp);

        await profileRepository.recordMatchResult(
          userId,
          {
            isWin: false,
            xpToAdd: xpReward,
            scoreToAdd: 0,
            newLevel: progress.currentLevel,
            newRankTier: progress.rankTier,
          },
          client
        );
      }
    }

    // Emite notificação de celebração do desbloqueio
    await notificationRepository.create(
      {
        userId,
        title: 'Nova Conquista Desbloqueada!',
        message: `Parabéns! Desbloqueou "${achievement.name}" (+${xpReward} XP): ${achievement.description}`,
        type: 'ACHIEVEMENT',
        link: '/profile',
      },
      client
    );

    logger.info(`Conquista desbloqueada: ${achievement.code} para o utilizador ${userId} (+${xpReward} XP)`);
  },

  /**
   * Retorna a lista completa de conquistas do jogador com indicação de estado e progresso.
   * 
   * @param {string} userId - UUID
   * @returns {Promise<Array<Object>>}
   */
  getUserAchievements: async (userId) => {
    return await achievementRepository.findUserAchievementsStatus(userId);
  },

  /**
   * Retorna as medalhas oficiais obtidas pelo competidor em torneios.
   * 
   * @param {string} userId - UUID
   * @returns {Promise<Array<Object>>}
   */
  getUserMedals: async (userId) => {
    return await achievementRepository.findUserMedals(userId);
  },
};

export default achievementService;