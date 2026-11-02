import { userRepository } from '../repositories/user.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { achievementRepository } from '../repositories/achievement.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { deleteFileIfExists } from '../utils/file-storage.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio para Gestão de Perfis, Gamificação e Personalização do Competidor.
 */
export const userService = {
  /**
   * Obtém o perfil completo do utilizador autenticado com estatísticas consolidadas.
   * 
   * @param {string} userId - UUID
   * @returns {Promise<Object>}
   */
  getProfile: async (userId) => {
    const profile = await profileRepository.getDetailedStats(userId);
    if (!profile) {
      throw new AppError('Perfil de utilizador não encontrado.', 404, 'PROFILE_NOT_FOUND');
    }

    const user = await userRepository.findById(userId);

    return {
      id: profile.id,
      userId: profile.user_id,
      username: user?.username,
      email: user?.email,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      xp: parseInt(profile.xp, 10),
      level: profile.level,
      totalScore: parseInt(profile.total_score, 10),
      matchesPlayed: profile.matches_played,
      matchesWon: profile.matches_won,
      matchesLost: profile.matches_lost,
      winRate: profile.matches_played > 0
        ? Math.round((profile.matches_won / profile.matches_played) * 10000) / 100
        : 0.00,
      rankTier: profile.rank_tier,
      countryCode: profile.country_code,
      phoneNumber: profile.phone_number,
      totalAchievements: parseInt(profile.total_achievements, 10),
      totalMedals: parseInt(profile.total_medals, 10),
      soloQuizzesCompleted: parseInt(profile.solo_quizzes_completed, 10),
      tournamentsJoined: parseInt(profile.tournaments_joined, 10),
      createdAt: profile.created_at,
      roles: user?.roles || ['PLAYER'],
    };
  },

  /**
   * Obtém o perfil público de qualquer jogador pelo username (para visualização por outros membros).
   * 
   * @param {string} username
   * @returns {Promise<Object>}
   */
  getPublicProfile: async (username) => {
    const profile = await profileRepository.findByUsername(username);
    if (!profile) {
      throw new AppError(`O competidor @${username} não foi encontrado.`, 404, 'USER_NOT_FOUND');
    }

    const [achievements, medals] = await Promise.all([
      achievementRepository.findUserAchievementsStatus(profile.user_id),
      achievementRepository.findUserMedals(profile.user_id),
    ]);

    return {
      userId: profile.user_id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      level: profile.level,
      xp: parseInt(profile.xp, 10),
      totalScore: parseInt(profile.total_score, 10),
      matchesPlayed: profile.matches_played,
      matchesWon: profile.matches_won,
      matchesLost: profile.matches_lost,
      winRate: parseFloat(profile.win_rate || 0),
      rankTier: profile.rank_tier,
      countryCode: profile.country_code,
      createdAt: profile.created_at,
      achievements: achievements.filter((a) => a.is_unlocked),
      medals,
    };
  },

  /**
   * Actualiza dados cadastrais e de apresentação do jogador.
   * 
   * @param {string} userId - UUID
   * @param {Object} data
   * @param {string} data.displayName
   * @param {string} [data.bio]
   * @param {string} [data.countryCode='AO']
   * @param {string|null} [data.phoneNumber=null]
   * @returns {Promise<Object>}
   */
  updateProfile: async (userId, { displayName, bio = '', countryCode = 'AO', phoneNumber = null }) => {
    const updated = await profileRepository.update(userId, {
      displayName,
      bio,
      countryCode,
      phoneNumber,
    });

    if (!updated) {
      throw new AppError('Não foi possível actualizar os dados do perfil.', 400, 'UPDATE_FAILED');
    }

    logger.info(`Perfil actualizado com sucesso para o utilizador: ${userId}`);
    return updated;
  },

  /**
   * Actualiza o avatar do jogador.
   * Se for upload de ficheiro físico novo, limpa com segurança o ficheiro anterior.
   * 
   * @param {string} userId - UUID
   * @param {Object} options
   * @param {string} [options.avatarUrl] - URL ou caminho de galeria
   * @param {Express.Multer.File} [options.uploadedFile] - Ficheiro processado pelo Multer
   * @returns {Promise<string>} Novo endereço do avatar
   */
  updateAvatar: async (userId, { avatarUrl = null, uploadedFile = null }) => {
    const currentProfile = await profileRepository.findByUserId(userId);
    if (!currentProfile) {
      throw new AppError('Perfil não localizado.', 404, 'PROFILE_NOT_FOUND');
    }

    let targetAvatarUrl = avatarUrl;

    // Se houve envio de imagem local personalizada via Multer
    if (uploadedFile) {
      targetAvatarUrl = `/uploads/avatars/${uploadedFile.filename}`;

      // Remove a foto antiga caso tenha sido um upload personalizado prévio
      if (
        currentProfile.avatar_url &&
        currentProfile.avatar_url.startsWith('/uploads/avatars/')
      ) {
        const oldFilename = currentProfile.avatar_url.replace('/uploads/avatars/', '');
        await deleteFileIfExists(`./storage/uploads/avatars/${oldFilename}`);
      }
    }

    if (!targetAvatarUrl) {
      throw new AppError('Nenhum avatar válido foi fornecido.', 400, 'INVALID_AVATAR');
    }

    await profileRepository.updateAvatar(userId, targetAvatarUrl);
    logger.info(`Avatar actualizado com sucesso para o utilizador: ${userId}`);

    return targetAvatarUrl;
  },

  /**
   * Consulta o histórico de partidas de quiz do utilizador com paginação.
   * 
   * @param {string} userId - UUID
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=10]
   * @param {string|null} [options.mode=null]
   * @returns {Promise<Object>}
   */
  getMatchHistory: async (userId, { page = 1, limit = 10, mode = null }) => {
    return await quizRepository.findUserHistoryPaginated(userId, { page, limit, mode });
  },

  /**
   * Retorna todas as conquistas do jogador com detalhe dos critérios e estado de desbloqueio.
   * 
   * @param {string} userId - UUID
   * @returns {Promise<Array<Object>>}
   */
  getAchievements: async (userId) => {
    return await achievementRepository.findUserAchievementsStatus(userId);
  },

  /**
   * Retorna as medalhas oficiais obtidas pelo jogador em competições e pódios.
   * 
   * @param {string} userId - UUID
   * @returns {Promise<Array<Object>>}
   */
  getMedals: async (userId) => {
    return await achievementRepository.findUserMedals(userId);
  },
};

export default userService;