import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados do Perfil Competitivo (User Profiles).
 * Controla XP, níveis de progressão, histórico de vitórias/derrotas e personalização.
 */
export const profileRepository = {
  /**
   * Localiza o perfil completo do utilizador pelo seu ID primário (UUID).
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client] - Cliente opcional para operações em transacção
   * @returns {Promise<Object|null>}
   */
  findByUserId: async (userId, client = null) => {
    const sql = `
      SELECT 
        p.id,
        p.user_id,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.xp,
        p.level,
        p.total_score,
        p.matches_played,
        p.matches_won,
        p.matches_lost,
        p.rank_tier,
        p.country_code,
        p.phone_number,
        p.created_at,
        p.updated_at,
        u.username,
        u.email,
        u.is_active,
        CASE 
          WHEN p.matches_played > 0 
          THEN ROUND((p.matches_won::numeric / p.matches_played::numeric) * 100, 2)
          ELSE 0.00 
        END AS win_rate
      FROM user_profiles p
      INNER JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return rows[0] || null;
  },

  /**
   * Localiza o perfil público de um jogador pelo seu nome de utilizador (username).
   * 
   * @param {string} username
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByUsername: async (username, client = null) => {
    const sql = `
      SELECT 
        p.id,
        p.user_id,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.xp,
        p.level,
        p.total_score,
        p.matches_played,
        p.matches_won,
        p.matches_lost,
        p.rank_tier,
        p.country_code,
        p.created_at,
        u.username,
        CASE 
          WHEN p.matches_played > 0 
          THEN ROUND((p.matches_won::numeric / p.matches_played::numeric) * 100, 2)
          ELSE 0.00 
        END AS win_rate
      FROM user_profiles p
      INNER JOIN users u ON u.id = p.user_id
      WHERE LOWER(u.username) = LOWER($1);
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [username]);
    return rows[0] || null;
  },

  /**
   * Cria o registo de perfil inicial de um jogador associado à sua conta.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {string} data.displayName
   * @param {string} [data.avatarUrl]
   * @param {string} [data.bio]
   * @param {string} [data.countryCode='AO']
   * @param {string} [data.phoneNumber]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Perfil criado
   */
  create: async (
    {
      userId,
      displayName,
      avatarUrl = '/assets/images/placeholders/default-avatar.png',
      bio = 'Gamer no ecossistema Anime Quiz.',
      countryCode = 'AO',
      phoneNumber = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO user_profiles (
        user_id,
        display_name,
        avatar_url,
        bio,
        country_code,
        phone_number
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      userId,
      displayName,
      avatarUrl,
      bio,
      countryCode,
      phoneNumber,
    ]);
    return rows[0];
  },

  /**
   * Actualiza os dados gerais e de contacto do perfil.
   * 
   * @param {string} userId - UUID
   * @param {Object} data
   * @param {string} data.displayName
   * @param {string} data.bio
   * @param {string} data.countryCode
   * @param {string} [data.phoneNumber]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  update: async (userId, { displayName, bio, countryCode, phoneNumber = null }, client = null) => {
    const sql = `
      UPDATE user_profiles
      SET 
        display_name = $2,
        bio = $3,
        country_code = $4,
        phone_number = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, displayName, bio, countryCode, phoneNumber]);
    return rows[0] || null;
  },

  /**
   * Actualiza o endereço do avatar do utilizador.
   * 
   * @param {string} userId - UUID
   * @param {string} avatarUrl - URL ou caminho absoluto interno do avatar
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  updateAvatar: async (userId, avatarUrl, client = null) => {
    const sql = `
      UPDATE user_profiles
      SET avatar_url = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId, avatarUrl]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Actualiza a progressão do jogador após uma partida competitiva ou torneio.
   * Incrementa XP, total de pontos, partidas disputadas e vitórias/derrotas de forma atómica.
   * 
   * @param {string} userId - UUID
   * @param {Object} result
   * @param {boolean} result.isWin
   * @param {number} result.xpToAdd
   * @param {number} result.scoreToAdd
   * @param {number} [result.newLevel]
   * @param {string} [result.newRankTier]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Perfil com atributos actualizados
   */
  recordMatchResult: async (
    userId,
    { isWin, xpToAdd = 0, scoreToAdd = 0, newLevel = null, newRankTier = null },
    client = null
  ) => {
    const sql = `
      UPDATE user_profiles
      SET 
        xp = xp + $2,
        total_score = total_score + $3,
        matches_played = matches_played + 1,
        matches_won = matches_won + (CASE WHEN $4 = TRUE THEN 1 ELSE 0 END),
        matches_lost = matches_lost + (CASE WHEN $4 = FALSE THEN 1 ELSE 0 END),
        level = COALESCE($5, level),
        rank_tier = COALESCE($6, rank_tier),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      userId,
      xpToAdd,
      scoreToAdd,
      isWin,
      newLevel,
      newRankTier,
    ]);
    return rows[0];
  },

  /**
   * Obtém as estatísticas agregadas completas de um jogador (conquistas, medalhas e histórico).
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  getDetailedStats: async (userId, client = null) => {
    const sql = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM user_achievements ua WHERE ua.user_id = p.user_id) AS total_achievements,
        (SELECT COUNT(*) FROM user_medals um WHERE um.user_id = p.user_id) AS total_medals,
        (SELECT COUNT(*) FROM quiz_sessions qs WHERE qs.user_id = p.user_id AND qs.status = 'COMPLETED') AS solo_quizzes_completed,
        (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.user_id = p.user_id AND tr.status = 'APPROVED') AS tournaments_joined
      FROM user_profiles p
      WHERE p.user_id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return rows[0] || null;
  },
};

export default profileRepository;