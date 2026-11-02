import { query } from '../database/connection.js';
import { rankingService } from '../services/ranking.service.js';
import { getIsoWeekIdentifier, getIsoMonthIdentifier, addDays } from '../utils/date.util.js';
import { logger } from '../utils/logger.util.js';

let snapshotIntervalId = null;

/**
 * Retorna o identificador ISO da semana anterior para fechamento de ranking semanal.
 * 
 * @returns {string} Ex: '2026-W43'
 */
const getPreviousWeekIdentifier = () => {
  const lastWeekDate = addDays(new Date(), -7);
  return getIsoWeekIdentifier(lastWeekDate);
};

/**
 * Retorna o identificador do mês anterior para fechamento de temporada mensal.
 * 
 * @returns {string} Ex: '2026-10'
 */
const getPreviousMonthIdentifier = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return getIsoMonthIdentifier(d);
};

/**
 * Verifica se já existe um snapshot consolidado para o período e identificador informados.
 * 
 * @param {'WEEKLY' | 'MONTHLY'} period
 * @param {string} periodIdentifier
 * @returns {Promise<boolean>}
 */
const hasSnapshotBeenExecuted = async (period, periodIdentifier) => {
  const sql = `
    SELECT 1 
    FROM ranking_snapshots 
    WHERE period = $1 AND period_identifier = $2 
    LIMIT 1;
  `;
  const { rows } = await query(sql, [period, periodIdentifier]);
  return rows.length > 0;
};

/**
 * Rotina periódica que consolida snapshots e consagra os campeões semanais e mensais.
 */
export const checkRankingSnapshots = async () => {
  try {
    const prevWeek = getPreviousWeekIdentifier();
    const currentWeek = getIsoWeekIdentifier();

    // 1. Fechamento de Ranking Semanal (se a semana mudou e ainda não foi arquivada)
    if (prevWeek !== currentWeek) {
      const isWeekArchived = await hasSnapshotBeenExecuted('WEEKLY', prevWeek);

      if (!isWeekArchived) {
        logger.info(`[JOB:RANKINGS] A consolidar snapshot do Ranking Semanal: ${prevWeek}...`);
        const snapshottedCount = await rankingService.snapshotPeriodicRankings('WEEKLY', prevWeek);
        logger.info(`[JOB:RANKINGS] ✓ Ranking Semanal (${prevWeek}) arquivado com ${snapshottedCount} competidores.`);
      }
    }

    // 2. Fechamento de Ranking Mensal (se o mês virou e ainda não foi arquivado)
    const prevMonth = getPreviousMonthIdentifier();
    const currentMonth = getIsoMonthIdentifier();

    if (prevMonth !== currentMonth) {
      const isMonthArchived = await hasSnapshotBeenExecuted('MONTHLY', prevMonth);

      if (!isMonthArchived) {
        logger.info(`[JOB:RANKINGS] A consolidar snapshot do Ranking Mensal da Temporada: ${prevMonth}...`);
        const snapshottedCount = await rankingService.snapshotPeriodicRankings('MONTHLY', prevMonth);
        logger.info(`[JOB:RANKINGS] ✓ Ranking Mensal (${prevMonth}) arquivado com ${snapshottedCount} competidores.`);
      }
    }
  } catch (error) {
    logger.error('[JOB:RANKINGS ERROR] Falha ao processar snapshots periódicos de rankings:', error.message);
  }
};

/**
 * Inicia o agendador de snapshots de rankings em segundo plano (execução a cada hora).
 * 
 * @param {number} [intervalMs=3600000] - Intervalo padrão: 1 hora
 */
export const startRankingSnapshotScheduler = (intervalMs = 3600000) => {
  if (snapshotIntervalId) return;

  // Executa uma primeira verificação no arranque
  checkRankingSnapshots();

  snapshotIntervalId = setInterval(checkRankingSnapshots, intervalMs);
  logger.info(`[JOB] Agendador de snapshots de rankings activo (Intervalo: ${intervalMs / 60000} minutos).`);
};

/**
 * Interrompe o agendador de snapshots durante o shutdown do servidor.
 */
export const stopRankingSnapshotScheduler = () => {
  if (snapshotIntervalId) {
    clearInterval(snapshotIntervalId);
    snapshotIntervalId = null;
    logger.info('[JOB] Agendador de snapshots de rankings interrompido.');
  }
};

export default {
  checkRankingSnapshots,
  startRankingSnapshotScheduler,
  stopRankingSnapshotScheduler,
};