import { query, withTransaction } from '../database/connection.js';
import { tournamentService } from '../services/tournament.service.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { logger } from '../utils/logger.util.js';

let schedulerIntervalId = null;

/**
 * Executa uma ronda de verificação e transição de estados dos torneios:
 * 1. Abre inscrições quando o horário de início for alcançado (PUBLISHED -> REGISTRATION_OPEN);
 * 2. Fecha inscrições no prazo determinado (REGISTRATION_OPEN -> REGISTRATION_CLOSED);
 * 3. Inicia o torneio e gera as chaves eliminatórias (REGISTRATION_CLOSED -> IN_PROGRESS);
 * 4. Cancela torneios que não atingiram o quórum mínimo de competidores confirmados.
 */
export const checkTournamentSchedules = async () => {
  try {
    // -------------------------------------------------------------------------
    // 1. Abertura Automática de Inscrições
    // -------------------------------------------------------------------------
    const openResult = await query(`
      UPDATE tournaments
      SET status = 'REGISTRATION_OPEN', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PUBLISHED'
        AND CURRENT_TIMESTAMP >= registration_start_at
        AND CURRENT_TIMESTAMP < registration_end_at
      RETURNING id, title;
    `);

    if (openResult.rows.length > 0) {
      openResult.rows.forEach((t) => {
        logger.info(`[JOB:TOURNAMENTS] Inscrições abertas para o torneio: ${t.title} (${t.id})`);
      });
    }

    // -------------------------------------------------------------------------
    // 2. Fecho Automático de Inscrições
    // -------------------------------------------------------------------------
    const closeResult = await query(`
      UPDATE tournaments
      SET status = 'REGISTRATION_CLOSED', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'REGISTRATION_OPEN'
        AND CURRENT_TIMESTAMP >= registration_end_at
      RETURNING id, title;
    `);

    if (closeResult.rows.length > 0) {
      closeResult.rows.forEach((t) => {
        logger.info(`[JOB:TOURNAMENTS] Inscrições encerradas para o torneio: ${t.title} (${t.id})`);
      });
    }

    // -------------------------------------------------------------------------
    // 3. Início de Torneios e Geração de Eliminatórias (Brackets)
    // -------------------------------------------------------------------------
    const { rows: tournamentsToStart } = await query(`
      SELECT id, title, max_participants 
      FROM tournaments
      WHERE status = 'REGISTRATION_CLOSED'
        AND CURRENT_TIMESTAMP >= tournament_start_at;
    `);

    for (const t of tournamentsToStart) {
      try {
        await withTransaction(async (client) => {
          const { rows: approved } = await client.query(
            `SELECT user_id FROM tournament_registrations 
             WHERE tournament_id = $1 AND status = 'APPROVED';`,
            [t.id]
          );

          if (approved.length >= 2) {
            // Gera as chaves eliminatórias e inicia o torneio
            await tournamentService.generateBrackets(t.id);

            // Notifica todos os competidores confirmados
            const userIds = approved.map((p) => p.user_id);
            await notificationRepository.createBulk(
              userIds,
              {
                title: 'O Torneio Começou!',
                message: `O torneio "${t.title}" iniciou as suas eliminatórias. Consulte o seu confronto na chave!`,
                type: 'TOURNAMENT',
                link: `/tournaments/${t.id}/bracket`,
              },
              client
            );

            logger.info(`[JOB:TOURNAMENTS] Torneio iniciado e brackets gerados: ${t.title} (${t.id})`);
          } else {
            // Cancela por falta de quórum mínimo (menos de 2 jogadores aprovados)
            await client.query(
              `UPDATE tournaments 
               SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP 
               WHERE id = $1;`,
              [t.id]
            );

            if (approved.length > 0) {
              const userIds = approved.map((p) => p.user_id);
              await notificationRepository.createBulk(
                userIds,
                {
                  title: 'Torneio Cancelado',
                  message: `O torneio "${t.title}" foi cancelado por não atingir o número mínimo de competidores.`,
                  type: 'TOURNAMENT',
                  link: `/tournaments/${t.id}`,
                },
                client
              );
            }

            logger.warn(`[JOB:TOURNAMENTS] Torneio ${t.title} cancelado por falta de quórum.`);
          }
        });
      } catch (err) {
        logger.error(`[JOB:TOURNAMENTS ERROR] Falha ao processar arranque do torneio ${t.id}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('[JOB:TOURNAMENTS ERROR] Falha geral no agendador de torneios:', error.message);
  }
};

/**
 * Inicia o agendador de torneios periódico em segundo plano.
 * 
 * @param {number} [intervalMs=60000] - Intervalo de verificação (padrão: 60 segundos)
 */
export const startTournamentScheduler = (intervalMs = 60000) => {
  if (schedulerIntervalId) return;

  // Executa uma primeira passagem imediata no arranque
  checkTournamentSchedules();

  schedulerIntervalId = setInterval(checkTournamentSchedules, intervalMs);
  logger.info(`[JOB] Agendador de torneios iniciado com intervalo de ${intervalMs / 1000}s.`);
};

/**
 * Interrompe o agendador durante o encerramento gracioso do servidor.
 */
export const stopTournamentScheduler = () => {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    logger.info('[JOB] Agendador de torneios interrompido.');
  }
};

export default {
  checkTournamentSchedules,
  startTournamentScheduler,
  stopTournamentScheduler,
};