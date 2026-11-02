import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados do Chat em Tempo Real e Moderação de Mensagens.
 * Gere canais de conversação (Global, Salas, Torneios), histórico persistente e sanções de silêncio (Mute).
 */
export const chatRepository = {
  // ===========================================================================
  // MÓDULO: CANAIS DE CONVERSAÇÃO (CONVERSATIONS)
  // ===========================================================================

  /**
   * Obtém ou inicializa de forma idempotente o canal principal de Chat Global.
   * 
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Canal Global
   */
  getOrCreateGlobalConversation: async (client = null) => {
    const selectSql = `
      SELECT * FROM conversations WHERE type = 'GLOBAL' AND is_active = TRUE LIMIT 1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows: existing } = await executor(selectSql);
    if (existing.length > 0) return existing[0];

    const insertSql = `
      INSERT INTO conversations (type, title, is_active)
      VALUES ('GLOBAL', 'Chat Geral da Comunidade', TRUE)
      RETURNING *;
    `;
    const { rows: created } = await executor(insertSql);
    return created[0];
  },

  /**
   * Obtém ou inicializa o canal de conversação atrelado a uma sala multiplayer.
   * 
   * @param {string} roomId - UUID
   * @param {string} roomName
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  getOrCreateRoomConversation: async (roomId, roomName, client = null) => {
    const selectSql = `
      SELECT * FROM conversations WHERE room_id = $1 LIMIT 1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows: existing } = await executor(selectSql, [roomId]);
    if (existing.length > 0) return existing[0];

    const insertSql = `
      INSERT INTO conversations (type, title, room_id, is_active)
      VALUES ('ROOM', $2, $1, TRUE)
      RETURNING *;
    `;
    const { rows: created } = await executor(insertSql, [roomId, `Sala: ${roomName}`]);
    return created[0];
  },

  /**
   * Obtém ou inicializa o canal de conversação geral de um torneio.
   * 
   * @param {string} tournamentId - UUID
   * @param {string} tournamentTitle
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  getOrCreateTournamentConversation: async (tournamentId, tournamentTitle, client = null) => {
    const selectSql = `
      SELECT * FROM conversations WHERE tournament_id = $1 LIMIT 1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows: existing } = await executor(selectSql, [tournamentId]);
    if (existing.length > 0) return existing[0];

    const insertSql = `
      INSERT INTO conversations (type, title, tournament_id, is_active)
      VALUES ('TOURNAMENT', $2, $1, TRUE)
      RETURNING *;
    `;
    const { rows: created } = await executor(insertSql, [
      tournamentId,
      `Torneio: ${tournamentTitle}`,
    ]);
    return created[0];
  },

  /**
   * Localiza uma conversa pelo seu ID primário.
   * 
   * @param {string} conversationId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findConversationById: async (conversationId, client = null) => {
    const sql = `SELECT * FROM conversations WHERE id = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [conversationId]);
    return rows[0] || null;
  },

  // ===========================================================================
  // MÓDULO: MEMBROS E MODERAÇÃO DO CHAT (MEMBERS & MUTES)
  // ===========================================================================

  /**
   * Adiciona um utilizador como membro do canal de chat.
   * 
   * @param {string} conversationId - UUID
   * @param {string} userId - UUID
   * @param {'MEMBER' | 'MODERATOR' | 'ADMIN'} [role='MEMBER']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  addMember: async (conversationId, userId, role = 'MEMBER', client = null) => {
    const sql = `
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        last_read_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [conversationId, userId, role]);
    return rows[0];
  },

  /**
   * Verifica se um utilizador se encontra com sanção de silêncio activa no canal.
   * 
   * @param {string} conversationId - UUID
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  isUserMuted: async (conversationId, userId, client = null) => {
    const sql = `
      SELECT 1 
      FROM conversation_members 
      WHERE conversation_id = $1 
        AND user_id = $2 
        AND is_muted = TRUE 
        AND (muted_until IS NULL OR muted_until > CURRENT_TIMESTAMP);
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [conversationId, userId]);
    return rows.length > 0;
  },

  /**
   * Aplica silêncio temporário (Mute) a um jogador tóxico no canal.
   * 
   * @param {string} conversationId - UUID
   * @param {string} userId - UUID
   * @param {number} [durationMinutes=15]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  muteUser: async (conversationId, userId, durationMinutes = 15, client = null) => {
    const sql = `
      UPDATE conversation_members
      SET 
        is_muted = TRUE,
        muted_until = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval
      WHERE conversation_id = $1 AND user_id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [conversationId, userId, durationMinutes]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Remove a sanção de silêncio de um jogador.
   * 
   * @param {string} conversationId - UUID
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  unmuteUser: async (conversationId, userId, client = null) => {
    const sql = `
      UPDATE conversation_members
      SET is_muted = FALSE, muted_until = NULL
      WHERE conversation_id = $1 AND user_id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [conversationId, userId]);
    return (result.rowCount || 0) > 0;
  },

  // ===========================================================================
  // MÓDULO: MENSAGENS E HISTÓRICO PERSISTENTE
  // ===========================================================================

  /**
   * Grava uma mensagem no canal de conversação.
   * 
   * @param {Object} data
   * @param {string} data.conversationId - UUID
   * @param {string} data.senderUserId - UUID
   * @param {string} data.content - Texto da mensagem
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Mensagem criada com dados do emissor
   */
  createMessage: async ({ conversationId, senderUserId, content }, client = null) => {
    const sql = `
      INSERT INTO messages (conversation_id, sender_user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [conversationId, senderUserId, content]);
    return rows[0];
  },

  /**
   * Consulta o histórico recente de mensagens de um canal, com dados dos perfis dos emissores.
   * 
   * @param {string} conversationId - UUID
   * @param {number} [limit=50]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>} Mensagens em ordem cronológica (mais antigas -> mais recentes)
   */
  findRecentMessages: async (conversationId, limit = 50, client = null) => {
    const sql = `
      SELECT * FROM (
        SELECT 
          m.id,
          m.conversation_id,
          m.sender_user_id,
          m.content,
          m.is_deleted,
          m.created_at,
          u.username AS sender_username,
          p.display_name AS sender_display_name,
          p.avatar_url AS sender_avatar_url,
          p.rank_tier AS sender_rank_tier
        FROM messages m
        INNER JOIN users u ON u.id = m.sender_user_id
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE m.conversation_id = $1
          AND m.is_deleted = FALSE
        ORDER BY m.created_at DESC
        LIMIT $2
      ) sub
      ORDER BY sub.created_at ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [conversationId, limit]);
    return rows;
  },

  /**
   * Oculta uma mensagem (Soft Delete) mantendo o registo para auditoria da moderação.
   * 
   * @param {string} messageId - UUID
   * @param {string} deletedByUserId - UUID do moderador
   * @param {string} [reason='Violação das diretrizes da comunidade']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  softDeleteMessage: async (
    messageId,
    deletedByUserId,
    reason = 'Violação das directrizes da comunidade',
    client = null
  ) => {
    const sql = `
      UPDATE messages
      SET 
        is_deleted = TRUE,
        deleted_by = $2,
        deleted_reason = $3
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [messageId, deletedByUserId, reason]);
    return (result.rowCount || 0) > 0;
  },
};

export default chatRepository;