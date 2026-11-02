import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados de Notificações em Tempo Real do Jogador.
 * Gere alertas de sistema, avisos de aprovação de pagamentos, convites de salas e conquistas.
 */
export const notificationRepository = {
  /**
   * Cria uma nova notificação para um utilizador.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {string} data.title
   * @param {string} data.message
   * @param {'SYSTEM' | 'TOURNAMENT' | 'PAYMENT' | 'ACHIEVEMENT' | 'ROOM_INVITE' | 'SECURITY'} [data.type='SYSTEM']
   * @param {string|null} [data.link=null] - Endereço interno de redireccionamento ao clicar
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Notificação criada
   */
  create: async (
    { userId, title, message, type = 'SYSTEM', link = null },
    client = null
  ) => {
    const sql = `
      INSERT INTO notifications (user_id, title, message, type, link)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, title, message, type, link]);
    return rows[0];
  },

  /**
   * Cria notificações em lote (bulk) para múltiplos destinatários (ex: início de torneio).
   * 
   * @param {Array<string>} userIds - Lista de UUIDs
   * @param {Object} notificationData
   * @param {string} notificationData.title
   * @param {string} notificationData.message
   * @param {string} [notificationData.type='SYSTEM']
   * @param {string|null} [notificationData.link=null]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<number>} Quantidade de notificações geradas
   */
  createBulk: async (
    userIds,
    { title, message, type = 'SYSTEM', link = null },
    client = null
  ) => {
    if (!userIds || userIds.length === 0) return 0;

    const sql = `
      INSERT INTO notifications (user_id, title, message, type, link)
      SELECT unnest($1::uuid[]), $2, $3, $4, $5;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userIds, title, message, type, link]);
    return result.rowCount || 0;
  },

  /**
   * Consulta as notificações de um utilizador com suporte a filtros e paginação.
   * 
   * @param {string} userId - UUID
   * @param {Object} options
   * @param {number} [options.limit=15]
   * @param {number} [options.offset=0]
   * @param {boolean} [options.unreadOnly=false]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findUserNotifications: async (
    userId,
    { limit = 15, offset = 0, unreadOnly = false },
    client = null
  ) => {
    const sql = `
      SELECT *
      FROM notifications
      WHERE user_id = $1
        AND ($2 = FALSE OR is_read = FALSE)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId, unreadOnly, limit, offset]);
    return rows;
  },

  /**
   * Retorna a contagem de notificações não lidas de um utilizador para o badge da barra de navegação.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<number>}
   */
  countUnread: async (userId, client = null) => {
    const sql = `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = $1 AND is_read = FALSE;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [userId]);
    return parseInt(rows[0]?.unread_count || 0, 10);
  },

  /**
   * Marca uma notificação individual como lida.
   * 
   * @param {string} id - UUID da notificação
   * @param {string} userId - UUID do dono da notificação
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  markAsRead: async (id, userId, client = null) => {
    const sql = `
      UPDATE notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND is_read = FALSE;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [id, userId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Marca todas as notificações não lidas do utilizador como lidas em simultâneo.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<number>} Total de notificações actualizadas
   */
  markAllAsRead: async (userId, client = null) => {
    const sql = `
      UPDATE notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = FALSE;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId]);
    return result.rowCount || 0;
  },

  /**
   * Remove uma notificação do histórico do jogador.
   * 
   * @param {string} id - UUID
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  delete: async (id, userId, client = null) => {
    const sql = `
      DELETE FROM notifications 
      WHERE id = $1 AND user_id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [id, userId]);
    return (result.rowCount || 0) > 0;
  },
};

export default notificationRepository;