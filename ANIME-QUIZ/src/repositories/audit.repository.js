import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados de Auditoria Administrativa, Denúncias e Parâmetros de Sistema.
 * Assegura rastreabilidade imutável de aprovações de pagamentos, sanções e configurações dinâmicas.
 */
export const auditRepository = {
  // ===========================================================================
  // MÓDULO: REGISTOS DE AUDITORIA ADMINISTRATIVA (AUDIT LOGS)
  // ===========================================================================

  /**
   * Grava um registo de auditoria imutável de uma acção administrativa.
   * 
   * @param {Object} data
   * @param {string} data.adminUserId - UUID do administrador/moderador
   * @param {string} data.action - Ex: 'APPROVE_PAYMENT', 'REJECT_PAYMENT', 'BAN_USER'
   * @param {string} data.targetEntity - Ex: 'payments', 'users', 'tournaments'
   * @param {string|null} [data.targetId=null] - Identificador da entidade afectada
   * @param {string|null} [data.ipAddress=null]
   * @param {string|null} [data.userAgent=null]
   * @param {Object|null} [data.previousData=null] - Snapshot anterior em JSON
   * @param {Object|null} [data.newData=null] - Snapshot novo em JSON
   * @param {string|null} [data.notes=null]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Registo criado
   */
  createAuditLog: async (
    {
      adminUserId,
      action,
      targetEntity,
      targetId = null,
      ipAddress = null,
      userAgent = null,
      previousData = null,
      newData = null,
      notes = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO admin_audit_logs (
        admin_user_id,
        action,
        target_entity,
        target_id,
        ip_address,
        user_agent,
        previous_data,
        new_data,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      adminUserId,
      action,
      targetEntity,
      targetId,
      ipAddress,
      userAgent,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      notes,
    ]);
    return rows[0];
  },

  /**
   * Consulta registos de auditoria com paginação e filtros para o painel de controlo.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @param {string} [options.action]
   * @param {string} [options.targetEntity]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ logs: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findAuditLogsPaginated: async (
    { page = 1, limit = 20, action = null, targetEntity = null },
    client = null
  ) => {
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM admin_audit_logs
      WHERE ($1::VARCHAR IS NULL OR action = $1)
        AND ($2::VARCHAR IS NULL OR target_entity = $2);
    `;

    const dataSql = `
      SELECT 
        l.*,
        u.username AS admin_username,
        p.display_name AS admin_display_name
      FROM admin_audit_logs l
      INNER JOIN users u ON u.id = l.admin_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE ($1::VARCHAR IS NULL OR l.action = $1)
        AND ($2::VARCHAR IS NULL OR l.target_entity = $2)
      ORDER BY l.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [action, targetEntity]),
      executor(dataSql, [action, targetEntity, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      logs: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: DENÚNCIAS E MODERAÇÃO (REPORTS)
  // ===========================================================================

  /**
   * Cria uma denúncia registada por um jogador ou detectada automaticamente pelo sistema.
   * 
   * @param {Object} data
   * @param {string} data.reporterUserId - UUID
   * @param {string|null} [data.reportedUserId=null] - UUID
   * @param {string|null} [data.reportedMessageId=null] - UUID
   * @param {string|null} [data.reportedRoomId=null] - UUID
   * @param {'CHEATING_SUSPICION' | 'TOXICITY' | 'OFFENSIVE_CONTENT' | 'SPAM' | 'PAYMENT_FRAUD' | 'OTHER'} data.reason
   * @param {string} data.description
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createReport: async (
    {
      reporterUserId,
      reportedUserId = null,
      reportedMessageId = null,
      reportedRoomId = null,
      reason,
      description,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO reports (
        reporter_user_id,
        reported_user_id,
        reported_message_id,
        reported_room_id,
        reason,
        description,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      reporterUserId,
      reportedUserId,
      reportedMessageId,
      reportedRoomId,
      reason,
      description,
    ]);
    return rows[0];
  },

  /**
   * Lista denúncias paginadas com dados completos dos envolvidos.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {string} [options.status] - 'PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ reports: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findReportsPaginated: async ({ page = 1, limit = 15, status = null }, client = null) => {
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM reports
      WHERE ($1::report_status_enum IS NULL OR status = $1);
    `;

    const dataSql = `
      SELECT 
        rep.*,
        reporter.username AS reporter_username,
        reported.username AS reported_username,
        resolver.username AS resolver_username
      FROM reports rep
      INNER JOIN users reporter ON reporter.id = rep.reporter_user_id
      LEFT JOIN users reported ON reported.id = rep.reported_user_id
      LEFT JOIN users resolver ON resolver.id = rep.resolved_by
      WHERE ($1::report_status_enum IS NULL OR rep.status = $1)
      ORDER BY 
        CASE WHEN rep.status = 'PENDING' THEN 1 ELSE 2 END ASC,
        rep.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [status]),
      executor(dataSql, [status, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      reports: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  /**
   * Conclui ou arquiva a investigação de uma denúncia.
   * 
   * @param {string} reportId - UUID
   * @param {'INVESTIGATING' | 'RESOLVED' | 'DISMISSED'} status
   * @param {string} resolutionNotes
   * @param {string} resolvedBy - UUID do moderador
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  resolveReport: async (reportId, status, resolutionNotes, resolvedBy, client = null) => {
    const sql = `
      UPDATE reports
      SET 
        status = $2,
        resolution_notes = $3,
        resolved_by = $4,
        resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [reportId, status, resolutionNotes, resolvedBy]);
    return rows[0] || null;
  },

  // ===========================================================================
  // MÓDULO: CONFIGURAÇÕES GLOBAIS DE SISTEMA (SYSTEM SETTINGS)
  // ===========================================================================

  /**
   * Obtém o valor de um parâmetro de configuração pelo seu nome chave.
   * 
   * @param {string} key
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<string|null>}
   */
  getSettingValue: async (key, client = null) => {
    const sql = `SELECT value FROM system_settings WHERE key = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [key]);
    return rows[0]?.value ?? null;
  },

  /**
   * Retorna todas as configurações da plataforma em formato chave-valor (Dictionary).
   * 
   * @param {boolean} [onlyPublic=false]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Record<string, string>>}
   */
  getAllSettingsMap: async (onlyPublic = false, client = null) => {
    const sql = `
      SELECT key, value 
      FROM system_settings 
      WHERE ($1 = FALSE OR is_public = TRUE);
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [onlyPublic]);

    const settingsMap = {};
    rows.forEach((row) => {
      settingsMap[row.key] = row.value;
    });
    return settingsMap;
  },

  /**
   * Actualiza ou insere um parâmetro operacional de sistema.
   * 
   * @param {Object} data
   * @param {string} data.key
   * @param {string} data.value
   * @param {string} [data.valueType='STRING']
   * @param {string} [data.description]
   * @param {boolean} [data.isPublic=false]
   * @param {string|null} [data.updatedBy=null] - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  upsertSetting: async (
    {
      key,
      value,
      valueType = 'STRING',
      description = '',
      isPublic = false,
      updatedBy = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO system_settings (key, value, value_type, description, is_public, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        value_type = EXCLUDED.value_type,
        description = COALESCE(EXCLUDED.description, system_settings.description),
        is_public = EXCLUDED.is_public,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      key,
      value,
      valueType,
      description,
      isPublic,
      updatedBy,
    ]);
    return rows[0];
  },
};

export default auditRepository;