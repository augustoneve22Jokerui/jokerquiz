import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados dos Torneios Oficiais, Eliminatórias (Brackets) e Inscrições.
 * Suporta bloqueio pessimista (`FOR UPDATE`) para controlo de lotação em concorrência elevada.
 */
export const tournamentRepository = {
  // ===========================================================================
  // MÓDULO: TORNEIOS (GESTÃO E CICLO DE VIDA)
  // ===========================================================================

  /**
   * Cria um novo torneio na base de dados.
   * 
   * @param {Object} data
   * @param {string} data.title
   * @param {string} data.slug
   * @param {string} data.description
   * @param {string} data.rules
   * @param {string} [data.bannerUrl]
   * @param {string} data.difficulty
   * @param {number|null} [data.categoryId]
   * @param {number} [data.maxParticipants=16]
   * @param {boolean} [data.isPaid=false]
   * @param {number} [data.entryFee=0]
   * @param {number} [data.prizePool=0]
   * @param {string} [data.currency='AOA']
   * @param {Date} data.registrationStartAt
   * @param {Date} data.registrationEndAt
   * @param {Date} data.tournamentStartAt
   * @param {string} data.createdBy - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Torneio criado
   */
  create: async (
    {
      title,
      slug,
      description,
      rules,
      bannerUrl = '/assets/images/placeholders/tournament-banner.png',
      difficulty,
      categoryId = null,
      maxParticipants = 16,
      isPaid = false,
      entryFee = 0,
      prizePool = 0,
      currency = 'AOA',
      registrationStartAt,
      registrationEndAt,
      tournamentStartAt,
      createdBy,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO tournaments (
        title,
        slug,
        description,
        rules,
        banner_url,
        difficulty,
        category_id,
        max_participants,
        is_paid,
        entry_fee,
        prize_pool,
        currency,
        status,
        registration_start_at,
        registration_end_at,
        tournament_start_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13, $14, $15, $16)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      title,
      slug,
      description,
      rules,
      bannerUrl,
      difficulty,
      categoryId,
      maxParticipants,
      isPaid,
      entryFee,
      prizePool,
      currency,
      registrationStartAt,
      registrationEndAt,
      tournamentStartAt,
      createdBy,
    ]);
    return rows[0];
  },

  /**
   * Localiza um torneio pelo seu ID primário (UUID).
   * 
   * @param {string} id - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findById: async (id, client = null) => {
    const sql = `
      SELECT 
        t.*,
        c.name AS category_name,
        champ.username AS champion_username,
        champ_p.display_name AS champion_display_name,
        champ_p.avatar_url AS champion_avatar_url,
        (
          SELECT COUNT(*) 
          FROM tournament_registrations tr 
          WHERE tr.tournament_id = t.id AND tr.status = 'APPROVED'
        ) AS approved_participants_count,
        (
          SELECT COUNT(*) 
          FROM tournament_registrations tr 
          WHERE tr.tournament_id = t.id
        ) AS total_registrations_count
      FROM tournaments t
      LEFT JOIN quiz_categories c ON c.id = t.category_id
      LEFT JOIN users champ ON champ.id = t.champion_user_id
      LEFT JOIN user_profiles champ_p ON champ_p.user_id = champ.id
      WHERE t.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza um torneio pelo seu slug único.
   * 
   * @param {string} slug
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findBySlug: async (slug, client = null) => {
    const sql = `
      SELECT 
        t.*,
        c.name AS category_name,
        champ.username AS champion_username,
        champ_p.display_name AS champion_display_name,
        champ_p.avatar_url AS champion_avatar_url,
        (
          SELECT COUNT(*) 
          FROM tournament_registrations tr 
          WHERE tr.tournament_id = t.id AND tr.status = 'APPROVED'
        ) AS approved_participants_count
      FROM tournaments t
      LEFT JOIN quiz_categories c ON c.id = t.category_id
      LEFT JOIN users champ ON champ.id = t.champion_user_id
      LEFT JOIN user_profiles champ_p ON champ_p.user_id = champ.id
      WHERE t.slug = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [slug]);
    return rows[0] || null;
  },

  /**
   * Bloqueia a linha do torneio para controlo estrito de concorrência e vagas restantes.
   * Deve ser executado obrigatoriamente dentro de uma transacção (`withTransaction`).
   * 
   * @param {string} tournamentId - UUID
   * @param {import('pg').PoolClient} client
   * @returns {Promise<Object|null>} Torneio bloqueado com exclusividade
   */
  findByIdWithLock: async (tournamentId, client) => {
    const sql = `
      SELECT id, max_participants, is_paid, entry_fee, status, registration_end_at
      FROM tournaments
      WHERE id = $1
      FOR UPDATE;
    `;
    const { rows } = await client.query(sql, [tournamentId]);
    return rows[0] || null;
  },

  /**
   * Actualiza o estado do torneio.
   * 
   * @param {string} tournamentId - UUID
   * @param {string} status - 'DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateStatus: async (tournamentId, status, client = null) => {
    const sql = `
      UPDATE tournaments
      SET 
        status = $2,
        tournament_end_at = CASE WHEN $2 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE tournament_end_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tournamentId, status]);
    return rows[0] || null;
  },

  /**
   * Define o jogador campeão do torneio.
   * 
   * @param {string} tournamentId - UUID
   * @param {string} championUserId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  setChampion: async (tournamentId, championUserId, client = null) => {
    const sql = `
      UPDATE tournaments
      SET 
        champion_user_id = $2,
        status = 'COMPLETED',
        tournament_end_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [tournamentId, championUserId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Lista torneios paginados para o catálogo público ou painel administrativo.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=12]
   * @param {string} [options.status]
   * @param {string} [options.difficulty]
   * @param {boolean} [options.isPaid]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ tournaments: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findPaginated: async (
    { page = 1, limit = 12, status = null, difficulty = null, isPaid = null },
    client = null
  ) => {
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM tournaments t
      WHERE ($1::tournament_status_enum IS NULL OR t.status = $1)
        AND ($2::quiz_difficulty_enum IS NULL OR t.difficulty = $2)
        AND ($3::BOOLEAN IS NULL OR t.is_paid = $3);
    `;

    const dataSql = `
      SELECT 
        t.*,
        c.name AS category_name,
        (
          SELECT COUNT(*) 
          FROM tournament_registrations tr 
          WHERE tr.tournament_id = t.id AND tr.status = 'APPROVED'
        ) AS approved_participants_count
      FROM tournaments t
      LEFT JOIN quiz_categories c ON c.id = t.category_id
      WHERE ($1::tournament_status_enum IS NULL OR t.status = $1)
        AND ($2::quiz_difficulty_enum IS NULL OR t.difficulty = $2)
        AND ($3::BOOLEAN IS NULL OR t.is_paid = $3)
      ORDER BY 
        CASE 
          WHEN t.status = 'REGISTRATION_OPEN' THEN 1
          WHEN t.status = 'IN_PROGRESS' THEN 2
          WHEN t.status = 'PUBLISHED' THEN 3
          ELSE 4 
        END ASC,
        t.tournament_start_at ASC
      LIMIT $4 OFFSET $5;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [status, difficulty, isPaid]),
      executor(dataSql, [status, difficulty, isPaid, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      tournaments: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: INSCRIÇÕES NO TORNEIO (REGISTRATIONS)
  // ===========================================================================

  /**
   * Cria uma inscrição de jogador no torneio.
   * 
   * @param {string} tournamentId - UUID
   * @param {string} userId - UUID
   * @param {string} [status='PENDING_PAYMENT']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createRegistration: async (tournamentId, userId, status = 'PENDING_PAYMENT', client = null) => {
    const sql = `
      INSERT INTO tournament_registrations (tournament_id, user_id, status)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tournamentId, userId, status]);
    return rows[0];
  },

  /**
   * Localiza a inscrição de um jogador num determinado torneio.
   * 
   * @param {string} tournamentId - UUID
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findRegistration: async (tournamentId, userId, client = null) => {
    const sql = `
      SELECT tr.*, t.title AS tournament_title, t.entry_fee, t.is_paid
      FROM tournament_registrations tr
      INNER JOIN tournaments t ON t.id = tr.tournament_id
      WHERE tr.tournament_id = $1 AND tr.user_id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tournamentId, userId]);
    return rows[0] || null;
  },

  /**
   * Actualiza o estado da inscrição do jogador (Aprovada, Rejeitada, Reembolsada, etc.).
   * 
   * @param {string} registrationId - UUID
   * @param {string} status - 'APPROVED', 'REJECTED', 'PROOF_SUBMITTED', etc.
   * @param {string|null} [reviewedBy] - UUID do moderador
   * @param {string|null} [rejectionReason]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateRegistrationStatus: async (
    registrationId,
    status,
    reviewedBy = null,
    rejectionReason = null,
    client = null
  ) => {
    const sql = `
      UPDATE tournament_registrations
      SET 
        status = $2,
        reviewed_by = COALESCE($3, reviewed_by),
        reviewed_at = CASE WHEN $3 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
        rejection_reason = COALESCE($4, rejection_reason)
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [registrationId, status, reviewedBy, rejectionReason]);
    return rows[0] || null;
  },

  // ===========================================================================
  // MÓDULO: CHAVES E ELIMINATÓRIAS (BRACKETS & MATCHES)
  // ===========================================================================

  /**
   * Cria uma fase eliminatória (Round) para o chaveamento.
   * 
   * @param {string} tournamentId - UUID
   * @param {number} roundNumber - 1 = Oitavas, 2 = Quartas, etc.
   * @param {string} name - Ex: 'Quartos de Final'
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createRound: async (tournamentId, roundNumber, name, client = null) => {
    const sql = `
      INSERT INTO tournament_rounds (tournament_id, round_number, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (tournament_id, round_number) DO UPDATE SET name = EXCLUDED.name
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tournamentId, roundNumber, name]);
    return rows[0];
  },

  /**
   * Retorna todas as fases eliminatórias de um torneio com as respectivas partidas.
   * 
   * @param {string} tournamentId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findRoundsWithMatches: async (tournamentId, client = null) => {
    const sql = `
      SELECT 
        tr.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', tm.id,
              'matchNumber', tm.match_number,
              'status', tm.status,
              'player1Id', tm.player1_user_id,
              'player1Score', tm.player1_score,
              'player1Name', p1.display_name,
              'player1Avatar', p1.avatar_url,
              'player2Id', tm.player2_user_id,
              'player2Score', tm.player2_score,
              'player2Name', p2.display_name,
              'player2Avatar', p2.avatar_url,
              'winnerId', tm.winner_user_id
            ) ORDER BY tm.match_number ASC
          )
          FROM tournament_matches tm
          LEFT JOIN user_profiles p1 ON p1.user_id = tm.player1_user_id
          LEFT JOIN user_profiles p2 ON p2.user_id = tm.player2_user_id
          WHERE tm.round_id = tr.id
        ) AS matches
      FROM tournament_rounds tr
      WHERE tr.tournament_id = $1
      ORDER BY tr.round_number ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tournamentId]);
    return rows;
  },

  /**
   * Insere um duelo / confronto directo na chave eliminatória.
   * 
   * @param {Object} matchData
   * @param {string} matchData.tournamentId - UUID
   * @param {number} matchData.roundId
   * @param {number} matchData.matchNumber
   * @param {string|null} [matchData.player1UserId]
   * @param {string|null} [matchData.player2UserId]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createMatch: async (
    { tournamentId, roundId, matchNumber, player1UserId = null, player2UserId = null },
    client = null
  ) => {
    const sql = `
      INSERT INTO tournament_matches (
        tournament_id,
        round_id,
        match_number,
        player1_user_id,
        player2_user_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      tournamentId,
      roundId,
      matchNumber,
      player1UserId,
      player2UserId,
    ]);
    return rows[0];
  },

  /**
   * Actualiza o resultado de uma partida eliminatória com registo do vencedor.
   * 
   * @param {string} matchId - UUID
   * @param {number} player1Score
   * @param {number} player2Score
   * @param {string} winnerUserId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateMatchResult: async (
    matchId,
    player1Score,
    player2Score,
    winnerUserId,
    client = null
  ) => {
    const sql = `
      UPDATE tournament_matches
      SET 
        player1_score = $2,
        player2_score = $3,
        winner_user_id = $4,
        status = 'COMPLETED',
        completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [matchId, player1Score, player2Score, winnerUserId]);
    return rows[0] || null;
  },
};

export default tournamentRepository;