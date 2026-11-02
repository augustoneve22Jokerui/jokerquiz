import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados das Salas Multiplayer e Jogadores em Tempo Real.
 * Gere criação de lobbies, matchmaking, contagem de jogadores e placares de arena.
 */
export const roomRepository = {
  // ===========================================================================
  // MÓDULO: SALAS MULTIPLAYER (LOBBIES & ARENAS)
  // ===========================================================================

  /**
   * Cria uma nova sala multiplayer.
   * 
   * @param {Object} data
   * @param {string} data.code - Código alfanumérico único (ex: 'AKAT99')
   * @param {string} data.name
   * @param {string} data.hostUserId - UUID
   * @param {boolean} [data.isPrivate=false]
   * @param {string|null} [data.passwordHash=null]
   * @param {number} [data.maxPlayers=8]
   * @param {string} data.difficulty - 'INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'
   * @param {number|null} [data.categoryId=null]
   * @param {number} [data.questionsCount=10]
   * @param {number} [data.timePerQuestion=15]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Sala criada
   */
  create: async (
    {
      code,
      name,
      hostUserId,
      isPrivate = false,
      passwordHash = null,
      maxPlayers = 8,
      difficulty,
      categoryId = null,
      questionsCount = 10,
      timePerQuestion = 15,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO rooms (
        code,
        name,
        host_user_id,
        is_private,
        password_hash,
        max_players,
        difficulty,
        category_id,
        questions_count,
        time_per_question,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'LOBBY')
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      code,
      name,
      hostUserId,
      isPrivate,
      passwordHash,
      maxPlayers,
      difficulty,
      categoryId,
      questionsCount,
      timePerQuestion,
    ]);
    return rows[0];
  },

  /**
   * Localiza uma sala pelo seu ID primário (UUID).
   * Inclui dados do anfitrião (Host) e categoria.
   * 
   * @param {string} id - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findById: async (id, client = null) => {
    const sql = `
      SELECT 
        r.*,
        u.username AS host_username,
        p.display_name AS host_display_name,
        p.avatar_url AS host_avatar_url,
        c.name AS category_name,
        (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id AND rp.left_at IS NULL) AS current_players_count
      FROM rooms r
      INNER JOIN users u ON u.id = r.host_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN quiz_categories c ON c.id = r.category_id
      WHERE r.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza uma sala activa pelo seu código de acesso curto (ex: 'AKAT99').
   * 
   * @param {string} code - Código em maiúsculas
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByCode: async (code, client = null) => {
    const sql = `
      SELECT 
        r.*,
        u.username AS host_username,
        p.display_name AS host_display_name,
        c.name AS category_name,
        (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id AND rp.left_at IS NULL) AS current_players_count
      FROM rooms r
      INNER JOIN users u ON u.id = r.host_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN quiz_categories c ON c.id = r.category_id
      WHERE UPPER(r.code) = UPPER($1)
        AND r.status NOT IN ('FINISHED', 'CANCELLED');
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [code]);
    return rows[0] || null;
  },

  /**
   * Actualiza o estado do ciclo de vida da sala (LOBBY, STARTING, IN_GAME, FINISHED, CANCELLED).
   * 
   * @param {string} roomId - UUID
   * @param {'LOBBY' | 'STARTING' | 'IN_GAME' | 'FINISHED' | 'CANCELLED'} status
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateStatus: async (roomId, status, client = null) => {
    const sql = `
      UPDATE rooms
      SET 
        status = $2,
        started_at = CASE WHEN $2 = 'IN_GAME' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
        ended_at = CASE WHEN $2 IN ('FINISHED', 'CANCELLED') THEN CURRENT_TIMESTAMP ELSE ended_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [roomId, status]);
    return rows[0] || null;
  },

  /**
   * Lista salas públicas disponíveis com vagas para entrada.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=12]
   * @param {string} [options.difficulty]
   * @param {number} [options.categoryId]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ rooms: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findOpenRoomsPaginated: async (
    { page = 1, limit = 12, difficulty = null, categoryId = null },
    client = null
  ) => {
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM rooms r
      WHERE r.status = 'LOBBY'
        AND r.is_private = FALSE
        AND ($1::quiz_difficulty_enum IS NULL OR r.difficulty = $1)
        AND ($2::INT IS NULL OR r.category_id = $2);
    `;

    const dataSql = `
      SELECT 
        r.*,
        u.username AS host_username,
        p.display_name AS host_display_name,
        p.avatar_url AS host_avatar_url,
        c.name AS category_name,
        COUNT(rp.id) FILTER (WHERE rp.left_at IS NULL) AS current_players_count
      FROM rooms r
      INNER JOIN users u ON u.id = r.host_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN quiz_categories c ON c.id = r.category_id
      LEFT JOIN room_players rp ON rp.room_id = r.id AND rp.left_at IS NULL
      WHERE r.status = 'LOBBY'
        AND r.is_private = FALSE
        AND ($1::quiz_difficulty_enum IS NULL OR r.difficulty = $1)
        AND ($2::INT IS NULL OR r.category_id = $2)
      GROUP BY r.id, u.username, p.display_name, p.avatar_url, c.name
      HAVING COUNT(rp.id) FILTER (WHERE rp.left_at IS NULL) < r.max_players
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [difficulty, categoryId]),
      executor(dataSql, [difficulty, categoryId, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      rooms: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: PARTICIPANTES DA SALA (ROOM PLAYERS)
  // ===========================================================================

  /**
   * Adiciona um jogador à sala multiplayer ou reativa a sua presença se já constava do lobby.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @param {boolean} [isHost=false]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  addPlayer: async (roomId, userId, isHost = false, client = null) => {
    const sql = `
      INSERT INTO room_players (room_id, user_id, is_host, is_ready, left_at)
      VALUES ($1, $2, $3, $3, NULL)
      ON CONFLICT (room_id, user_id) DO UPDATE SET
        is_host = EXCLUDED.is_host,
        left_at = NULL,
        joined_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [roomId, userId, isHost]);
    return rows[0];
  },

  /**
   * Marca a saída de um jogador da sala.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  removePlayer: async (roomId, userId, client = null) => {
    const sql = `
      UPDATE room_players
      SET left_at = CURRENT_TIMESTAMP, is_ready = FALSE
      WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [roomId, userId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Alterna o estado de prontidão (Ready) de um jogador no lobby.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @param {boolean} isReady
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  setPlayerReady: async (roomId, userId, isReady, client = null) => {
    const sql = `
      UPDATE room_players
      SET is_ready = $3
      WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [roomId, userId, isReady]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Incrementa atómicamente a pontuação e acertos de um jogador durante a partida multiplayer.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @param {number} scoreDelta - Pontos ganhos na questão
   * @param {boolean} isCorrect - Se a resposta foi certa
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updatePlayerScore: async (roomId, userId, scoreDelta, isCorrect, client = null) => {
    const sql = `
      UPDATE room_players
      SET 
        score = score + $3,
        correct_answers = correct_answers + (CASE WHEN $4 = TRUE THEN 1 ELSE 0 END)
      WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [roomId, userId, scoreDelta, isCorrect]);
    return rows[0] || null;
  },

  /**
   * Retorna todos os jogadores activos numa sala ordenados pela pontuação decrescente.
   * 
   * @param {string} roomId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findPlayersByRoomId: async (roomId, client = null) => {
    const sql = `
      SELECT 
        rp.*,
        u.username,
        p.display_name,
        p.avatar_url,
        p.rank_tier,
        p.level
      FROM room_players rp
      INNER JOIN users u ON u.id = rp.user_id
      INNER JOIN user_profiles p ON p.user_id = u.id
      WHERE rp.room_id = $1 AND rp.left_at IS NULL
      ORDER BY rp.score DESC, rp.joined_at ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [roomId]);
    return rows;
  },

  // ===========================================================================
  // MÓDULO: CONVITES PARA SALAS (INVITATIONS)
  // ===========================================================================

  /**
   * Cria um convite para outro jogador entrar na sala.
   * 
   * @param {string} roomId - UUID
   * @param {string} inviterUserId - UUID
   * @param {string} inviteeUserId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createInvitation: async (roomId, inviterUserId, inviteeUserId, client = null) => {
    const sql = `
      INSERT INTO room_invitations (room_id, inviter_user_id, invitee_user_id)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [roomId, inviterUserId, inviteeUserId]);
    return rows[0];
  },

  /**
   * Consulta convites pendentes de um utilizador.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findPendingInvitations: async (userId, client = null) => {
    const sql = `
      SELECT 
        ri.*,
        r.name AS room_name,
        r.code AS room_code,
        r.difficulty,
        u.username AS inviter_username,
        p.display_name AS inviter_display_name,
        p.avatar_url AS inviter_avatar_url
      FROM room_invitations ri
      INNER JOIN rooms r ON r.id = ri.room_id
      INNER JOIN users u ON u.id = ri.inviter_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE ri.invitee_user_id = $1
        AND ri.status = 'PENDING'
        AND ri.expires_at > CURRENT_TIMESTAMP
        AND r.status = 'LOBBY'
      ORDER BY ri.created_at DESC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return rows;
  },
};

export default roomRepository;