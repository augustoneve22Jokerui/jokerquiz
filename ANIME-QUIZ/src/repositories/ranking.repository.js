import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados das Tabelas de Classificação Competitiva (Rankings e Snapshots).
 * Suporta rankings globais perpétuos, sazonais (semanais/mensais) e segmentados por dificuldade.
 */
export const rankingRepository = {
  // ===========================================================================
  // MÓDULO: TABELAS DE CLASSIFICAÇÃO EM TEMPO REAL (LEADERBOARDS)
  // ===========================================================================

  /**
   * Obtém a lista classificada de jogadores para um determinado período e dificuldade.
   * 
   * @param {Object} options
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} [options.period='GLOBAL']
   * @param {string} [options.periodIdentifier='ALL_TIME'] - Ex: 'ALL_TIME', '2026-W44', '2026-11'
   * @param {string|null} [options.difficulty=null] - Dificuldade específica ou null para geral
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>} Lista de classificação com dados de perfil
   */
  getLeaderboard: async (
    {
      period = 'GLOBAL',
      periodIdentifier = 'ALL_TIME',
      difficulty = null,
      limit = 50,
      offset = 0,
    },
    client = null
  ) => {
    const sql = `
      SELECT 
        r.id,
        r.user_id,
        r.period,
        r.period_identifier,
        r.difficulty,
        r.score,
        r.xp,
        r.wins,
        r.matches_played,
        r.win_rate,
        r.current_position,
        r.previous_position,
        (r.previous_position - r.current_position) AS position_delta,
        u.username,
        p.display_name,
        p.avatar_url,
        p.rank_tier,
        p.level
      FROM rankings r
      INNER JOIN users u ON u.id = r.user_id
      INNER JOIN user_profiles p ON p.user_id = u.id
      WHERE r.period = $1
        AND r.period_identifier = $2
        AND ($3::quiz_difficulty_enum IS NULL OR r.difficulty = $3)
        AND u.is_active = TRUE
      ORDER BY r.current_position ASC, r.score DESC, r.wins DESC
      LIMIT $4 OFFSET $5;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      period,
      periodIdentifier,
      difficulty,
      limit,
      offset,
    ]);
    return rows;
  },

  /**
   * Obtém o registo de classificação e a posição exata de um utilizador específico.
   * 
   * @param {string} userId - UUID
   * @param {Object} options
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} [options.period='GLOBAL']
   * @param {string} [options.periodIdentifier='ALL_TIME']
   * @param {string|null} [options.difficulty=null]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  getUserRankCard: async (
    userId,
    { period = 'GLOBAL', periodIdentifier = 'ALL_TIME', difficulty = null },
    client = null
  ) => {
    const sql = `
      SELECT 
        r.*,
        (r.previous_position - r.current_position) AS position_delta,
        u.username,
        p.display_name,
        p.avatar_url,
        p.rank_tier,
        p.level
      FROM rankings r
      INNER JOIN users u ON u.id = r.user_id
      INNER JOIN user_profiles p ON p.user_id = u.id
      WHERE r.user_id = $1
        AND r.period = $2
        AND r.period_identifier = $3
        AND ($4::quiz_difficulty_enum IS NULL OR r.difficulty = $4);
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, period, periodIdentifier, difficulty]);
    return rows[0] || null;
  },

  /**
   * Actualiza ou insere atómicamente os pontos de um jogador no ranking correspondente.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} data.period
   * @param {string} data.periodIdentifier
   * @param {string|null} [data.difficulty=null]
   * @param {number} data.scoreDelta
   * @param {number} data.xpDelta
   * @param {boolean} data.isWin
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  upsertUserRanking: async (
    {
      userId,
      period,
      periodIdentifier,
      difficulty = null,
      scoreDelta,
      xpDelta,
      isWin,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO rankings (
        user_id,
        period,
        period_identifier,
        difficulty,
        score,
        xp,
        wins,
        matches_played,
        win_rate,
        current_position,
        previous_position
      ) VALUES (
        $1, $2, $3, $4,
        GREATEST(0, $5),
        GREATEST(0, $6),
        (CASE WHEN $7 = TRUE THEN 1 ELSE 0 END),
        1,
        (CASE WHEN $7 = TRUE THEN 100.00 ELSE 0.00 END),
        0, 0
      )
      ON CONFLICT (user_id, period, period_identifier, difficulty) DO UPDATE SET
        score = rankings.score + EXCLUDED.score,
        xp = rankings.xp + EXCLUDED.xp,
        matches_played = rankings.matches_played + 1,
        wins = rankings.wins + (CASE WHEN $7 = TRUE THEN 1 ELSE 0 END),
        win_rate = ROUND(
          ((rankings.wins + (CASE WHEN $7 = TRUE THEN 1 ELSE 0 END))::numeric / 
          (rankings.matches_played + 1)::numeric) * 100, 2
        ),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      userId,
      period,
      periodIdentifier,
      difficulty,
      scoreDelta,
      xpDelta,
      isWin,
    ]);
    return rows[0];
  },

  /**
   * Recalcula em lote as posições de uma tabela de classificação usando Window Functions nativas.
   * Transfere current_position para previous_position e atribui a nova colocação por pontuação.
   * 
   * @param {'GLOBAL' | 'WEEKLY' | 'MONTHLY'} period
   * @param {string} periodIdentifier
   * @param {string|null} [difficulty=null]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<void>}
   */
  recalculatePositions: async (
    period,
    periodIdentifier,
    difficulty = null,
    client = null
  ) => {
    const sql = `
      WITH ranked AS (
        SELECT 
          id,
          current_position AS old_position,
          ROW_NUMBER() OVER (ORDER BY score DESC, wins DESC, win_rate DESC, xp DESC) AS new_position
        FROM rankings
        WHERE period = $1
          AND period_identifier = $2
          AND ($3::quiz_difficulty_enum IS NULL OR difficulty = $3)
      )
      UPDATE rankings r
      SET 
        previous_position = CASE WHEN r.current_position = 0 THEN ranked.new_position ELSE r.current_position END,
        current_position = ranked.new_position,
        updated_at = CURRENT_TIMESTAMP
      FROM ranked
      WHERE r.id = ranked.id;
    `;
    const executor = client ? client.query.bind(client) : query;
    await executor(sql, [period, periodIdentifier, difficulty]);
  },

  // ===========================================================================
  // MÓDULO: REGISTOS HISTÓRICOS E SNAPSHOTS (FIM DE TEMPORADA / SEMANA)
  // ===========================================================================

  /**
   * Cria um instantâneo (Snapshot) final de encerramento de temporada ou ranking semanal.
   * 
   * @param {Object} data
   * @param {'WEEKLY' | 'MONTHLY'} data.period
   * @param {string} data.periodIdentifier
   * @param {string} data.userId - UUID
   * @param {number} data.finalPosition
   * @param {number} data.score
   * @param {number} data.xp
   * @param {number} data.wins
   * @param {Object} [data.rewardsGranted={}]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createSnapshot: async (
    {
      period,
      periodIdentifier,
      userId,
      finalPosition,
      score,
      xp,
      wins,
      rewardsGranted = {},
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO ranking_snapshots (
        period,
        period_identifier,
        user_id,
        final_position,
        score,
        xp,
        wins,
        rewards_granted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      period,
      periodIdentifier,
      userId,
      finalPosition,
      score,
      xp,
      wins,
      JSON.stringify(rewardsGranted),
    ]);
    return rows[0];
  },

  /**
   * Consulta os pódios e vencedores históricos de temporadas ou semanas anteriores.
   * 
   * @param {'WEEKLY' | 'MONTHLY'} period
   * @param {string} periodIdentifier
   * @param {number} [limit=10]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  getSnapshotLeaderboard: async (period, periodIdentifier, limit = 10, client = null) => {
    const sql = `
      SELECT 
        rs.*,
        u.username,
        p.display_name,
        p.avatar_url,
        p.rank_tier
      FROM ranking_snapshots rs
      INNER JOIN users u ON u.id = rs.user_id
      INNER JOIN user_profiles p ON p.user_id = u.id
      WHERE rs.period = $1 AND rs.period_identifier = $2
      ORDER BY rs.final_position ASC
      LIMIT $3;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [period, periodIdentifier, limit]);
    return rows;
  },
};

export default rankingRepository;