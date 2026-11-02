import { query } from '../database/connection.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio para Auditoria Administrativa, Gestão de Denúncias,
 * Métricas do Painel de Controlo e Definições Dinâmicas da Plataforma.
 */
export const auditService = {
  // ===========================================================================
  // MÓDULO: AUDITORIA FORENSE DE OPERAÇÕES ADMINISTRATIVAS
  // ===========================================================================

  /**
   * Regista de forma padronizada uma operação administrativa com dados anteriores e novos.
   * 
   * @param {Object} data
   * @param {string} data.adminUserId - UUID
   * @param {string} data.action - Ex: 'APPROVE_PAYMENT', 'SUSPEND_USER', 'UPDATE_SETTINGS'
   * @param {string} data.targetEntity - Ex: 'payments', 'users', 'tournaments', 'settings'
   * @param {string|null} [data.targetId=null]
   * @param {string|null} [data.ipAddress=null]
   * @param {string|null} [data.userAgent=null]
   * @param {Object|null} [data.previousData=null]
   * @param {Object|null} [data.newData=null]
   * @param {string|null} [data.notes=null]
   * @returns {Promise<Object>} Registo de auditoria
   */
  logAction: async ({
    adminUserId,
    action,
    targetEntity,
    targetId = null,
    ipAddress = null,
    userAgent = null,
    previousData = null,
    newData = null,
    notes = null,
  }) => {
    const logRecord = await auditRepository.createAuditLog({
      adminUserId,
      action,
      targetEntity,
      targetId,
      ipAddress,
      userAgent,
      previousData,
      newData,
      notes,
    });

    logger.audit(action, {
      adminUserId,
      targetEntity,
      targetId,
      ipAddress,
    });

    return logRecord;
  },

  /**
   * Consulta o histórico paginado de logs de auditoria administrativa.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @param {string|null} [options.action=null]
   * @param {string|null} [options.targetEntity=null]
   * @returns {Promise<Object>}
   */
  getAuditLogs: async ({ page = 1, limit = 20, action = null, targetEntity = null }) => {
    return await auditRepository.findAuditLogsPaginated({
      page,
      limit,
      action,
      targetEntity,
    });
  },

  // ===========================================================================
  // MÓDULO: DENÚNCIAS E MODERAÇÃO DA COMUNIDADE (REPORTS)
  // ===========================================================================

  /**
   * Submete uma denúncia contra um utilizador, mensagem ofensiva ou sala multiplayer.
   * 
   * @param {Object} data
   * @param {string} data.reporterUserId - UUID
   * @param {string|null} [data.reportedUserId=null]
   * @param {string|null} [data.reportedMessageId=null]
   * @param {string|null} [data.reportedRoomId=null]
   * @param {'CHEATING_SUSPICION' | 'TOXICITY' | 'OFFENSIVE_CONTENT' | 'SPAM' | 'PAYMENT_FRAUD' | 'OTHER'} data.reason
   * @param {string} data.description
   * @returns {Promise<Object>}
   */
  createReport: async ({
    reporterUserId,
    reportedUserId = null,
    reportedMessageId = null,
    reportedRoomId = null,
    reason,
    description,
  }) => {
    if (!description || description.trim().length < 5) {
      throw new AppError(
        'A descrição da denúncia deve conter pelo menos 5 caracteres.',
        400,
        'INVALID_REPORT_DESCRIPTION'
      );
    }

    const report = await auditRepository.createReport({
      reporterUserId,
      reportedUserId,
      reportedMessageId,
      reportedRoomId,
      reason,
      description: description.trim(),
    });

    logger.info(`Nova denúncia registada: ID=${report.id} | Motivo=${reason} | Denunciante=${reporterUserId}`);
    return report;
  },

  /**
   * Lista denúncias com filtros para o painel de moderação.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {string|null} [options.status=null]
   * @returns {Promise<Object>}
   */
  getReports: async ({ page = 1, limit = 15, status = null }) => {
    return await auditRepository.findReportsPaginated({ page, limit, status });
  },

  /**
   * Conclui ou arquiva a moderação de uma denúncia com justificativa administrativa.
   * 
   * @param {Object} data
   * @param {string} data.reportId - UUID
   * @param {'INVESTIGATING' | 'RESOLVED' | 'DISMISSED'} data.status
   * @param {string} data.resolutionNotes
   * @param {string} data.adminUserId - UUID
   * @returns {Promise<Object>}
   */
  resolveReport: async ({ reportId, status, resolutionNotes, adminUserId }) => {
    const updatedReport = await auditRepository.resolveReport(
      reportId,
      status,
      resolutionNotes,
      adminUserId
    );

    if (!updatedReport) {
      throw new AppError('Denúncia não encontrada.', 404, 'REPORT_NOT_FOUND');
    }

    await auditService.logAction({
      adminUserId,
      action: 'RESOLVE_REPORT',
      targetEntity: 'reports',
      targetId: reportId,
      newData: { status, resolutionNotes },
      notes: `Denúncia resolvida com estado: ${status}`,
    });

    return updatedReport;
  },

  // ===========================================================================
  // MÓDULO: CONFIGURAÇÕES OPERACIONAIS DINÂMICAS (SETTINGS)
  // ===========================================================================

  /**
   * Retorna os parâmetros de configuração da plataforma em formato chave-valor.
   * 
   * @param {boolean} [onlyPublic=false]
   * @returns {Promise<Record<string, string>>}
   */
  getPlatformSettings: async (onlyPublic = false) => {
    return await auditRepository.getAllSettingsMap(onlyPublic);
  },

  /**
   * Actualiza um parâmetro de configuração do sistema e audita a alteração.
   * 
   * @param {Object} data
   * @param {string} data.key
   * @param {string} data.value
   * @param {string} data.adminUserId - UUID
   * @param {string} [data.description='']
   * @returns {Promise<Object>}
   */
  updatePlatformSetting: async ({ key, value, adminUserId, description = '' }) => {
    const previousValue = await auditRepository.getSettingValue(key);

    const setting = await auditRepository.upsertSetting({
      key,
      value,
      valueType: 'STRING',
      description,
      isPublic: true,
      updatedBy: adminUserId,
    });

    await auditService.logAction({
      adminUserId,
      action: 'UPDATE_SYSTEM_SETTING',
      targetEntity: 'system_settings',
      targetId: key,
      previousData: { key, value: previousValue },
      newData: { key, value },
      notes: `Parâmetro de sistema actualizado por administrador.`,
    });

    return setting;
  },

  // ===========================================================================
  // MÓDULO: MÉTRICAS CONSOLIDADAS DO PAINEL ADMINISTRATIVO (DASHBOARD KPIs)
  // ===========================================================================

  /**
   * Agrega métricas executivas em tempo real para a visão geral do painel administrativo.
   * 
   * @returns {Promise<Object>} Indicadores-chave de desempenho (KPIs)
   */
  getAdminDashboardSummary: async () => {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS total_active_users,
        (SELECT COUNT(*) FROM tournaments WHERE status IN ('REGISTRATION_OPEN', 'IN_PROGRESS')) AS active_tournaments_count,
        (SELECT COUNT(*) FROM payment_proofs WHERE status = 'UNDER_REVIEW') AS pending_proofs_count,
        (SELECT COUNT(*) FROM reports WHERE status = 'PENDING') AS pending_reports_count,
        (SELECT COUNT(*) FROM quiz_questions WHERE is_published = TRUE) AS total_published_questions,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'APPROVED') AS total_revenue_aoa;
    `;
    const { rows } = await query(sql);
    const raw = rows[0] || {};

    return {
      totalActiveUsers: parseInt(raw.total_active_users || 0, 10),
      activeTournamentsCount: parseInt(raw.active_tournaments_count || 0, 10),
      pendingProofsCount: parseInt(raw.pending_proofs_count || 0, 10),
      pendingReportsCount: parseInt(raw.pending_reports_count || 0, 10),
      totalPublishedQuestions: parseInt(raw.total_published_questions || 0, 10),
      totalRevenueAoa: parseFloat(raw.total_revenue_aoa || 0),
    };
  },
};

export default auditService;