import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados do Sistema de Conquistas (Achievements) e Medalhas Oficiais.
 * Gere desbloqueios de insígnias, verificação de critérios de gaming e atribuição de medalhas de torneios.
 */
export const achievementRepository = {
  // ===========================================================================
  // MÓDULO: CONQUISTAS (ACHIEVEMENTS)
  // ===========================================================================

  /**
   * Retorna todas as conquistas catalogadas no ecossistema ordenadas por nível.
   * 
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findAll: async (client = null) => {
    const sql = `
      SELECT * 
      FROM achievements 
      ORDER BY 
        CASE badge_tier
          WHEN 'BRONZE' THEN 1
          WHEN 'SILVER' THEN 2
          WHEN 'GOLD' THEN 3
          WHEN 'PLATINUM' THEN 4
          WHEN 'DIAMOND' THEN 5
          ELSE 6
        END ASC,
        criteria_threshold ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql);
    return rows;
  },

  /**
   * Localiza uma conquista específica pelo seu código único.
   * 
   * @param {string} code - Ex: 'FIRST_BLOOD', 'HOKAGE_LEGEND'
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByCode: async (code, client = null) => {
    const sql = `SELECT * FROM achievements WHERE code = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [code]);
    return rows[0] || null;
  },

  /**
   * Obtém a lista completa de conquistas do sistema indicando o estado de desbloqueio para um utilizador.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findUserAchievementsStatus: async (userId, client = null) => {
    const sql = `
      SELECT 
        a.*,
        ua.unlocked_at,
        CASE WHEN ua.id IS NOT NULL THEN TRUE ELSE FALSE END AS is_unlocked
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
      ORDER BY 
        is_unlocked DESC,
        CASE a.badge_tier
          WHEN 'BRONZE' THEN 1
          WHEN 'SILVER' THEN 2
          WHEN 'GOLD' THEN 3
          WHEN 'PLATINUM' THEN 4
          WHEN 'DIAMOND' THEN 5
          ELSE 6
        END ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return rows;
  },

  /**
   * Verifica se o utilizador já desbloqueou uma conquista específica.
   * 
   * @param {string} userId - UUID
   * @param {number} achievementId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  hasUserUnlocked: async (userId, achievementId, client = null) => {
    const sql = `
      SELECT 1 FROM user_achievements 
      WHERE user_id = $1 AND achievement_id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, achievementId]);
    return rows.length > 0;
  },

  /**
   * Regista o desbloqueio de uma conquista de forma atómica e idempotente.
   * 
   * @param {string} userId - UUID
   * @param {number} achievementId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>} Registo inserido ou null se já havia sido desbloqueada
   */
  unlockAchievement: async (userId, achievementId, client = null) => {
    const sql = `
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, achievementId]);
    return rows[0] || null;
  },

  /**
   * Localiza conquistas que coincidam com um tipo de critério e cujo limiar foi alcançado.
   * 
   * @param {string} criteriaType - Ex: 'WINS_COUNT', 'HOKAGE_STREAK', 'PERFECT_SCORE'
   * @param {number} currentValue
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findEligibleAchievements: async (criteriaType, currentValue, client = null) => {
    const sql = `
      SELECT * 
      FROM achievements 
      WHERE criteria_type = $1 
        AND criteria_threshold <= $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [criteriaType, currentValue]);
    return rows;
  },

  // ===========================================================================
  // MÓDULO: MEDALHAS OFICIAIS (MEDALS)
  // ===========================================================================

  /**
   * Retorna todas as medalhas do catálogo oficial do sistema.
   * 
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findAllMedals: async (client = null) => {
    const sql = `SELECT * FROM medals ORDER BY id ASC;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql);
    return rows;
  },

  /**
   * Localiza uma medalha pelo seu código oficial.
   * 
   * @param {string} code - Ex: 'GOLD_CROWN', 'TOP_RANKING_SEASON'
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByMedalCode: async (code, client = null) => {
    const sql = `SELECT * FROM medals WHERE code = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [code]);
    return rows[0] || null;
  },

  /**
   * Obtém as medalhas conquistadas por um jogador, com detalhe do torneio associado.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findUserMedals: async (userId, client = null) => {
    const sql = `
      SELECT 
        um.id,
        um.awarded_at,
        m.code AS medal_code,
        m.name AS medal_name,
        m.description AS medal_description,
        m.icon_url AS medal_icon_url,
        t.title AS tournament_title,
        t.slug AS tournament_slug
      FROM user_medals um
      INNER JOIN medals m ON m.id = um.medal_id
      LEFT JOIN tournaments t ON t.id = um.tournament_id
      WHERE um.user_id = $1
      ORDER BY um.awarded_at DESC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return rows;
  },

  /**
   * Concede oficialmente uma medalha a um jogador por mérito em torneio ou ranking.
   * 
   * @param {string} userId - UUID
   * @param {number} medalId
   * @param {string|null} [tournamentId=null] - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  awardMedal: async (userId, medalId, tournamentId = null, client = null) => {
    const sql = `
      INSERT INTO user_medals (user_id, medal_id, tournament_id)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, medalId, tournamentId]);
    return rows[0];
  },
};

export default achievementRepository;