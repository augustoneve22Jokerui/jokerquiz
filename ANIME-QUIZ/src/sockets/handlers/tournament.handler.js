import { tournamentRepository } from '../../repositories/tournament.repository.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Manipulador de Eventos de WebSocket para Acompanhamento em Directo de Torneios Oficiais.
 * Transmite actualizações de chaves eliminatórias (Brackets), início de duelos e consagração de campeões.
 * 
 * @param {import('socket.io').Server} io - Instância principal do Socket.IO
 * @param {import('socket.io').Socket} socket - Conexão do espectador ou jogador
 */
export const registerTournamentHandlers = (io, socket) => {
  const userId = socket.data.userId;

  /**
   * Conecta o cliente à transmissão em directo de um torneio específico.
   */
  socket.on('tournament:join_view', async ({ tournamentId }, callback) => {
    try {
      const tournament = await tournamentRepository.findById(tournamentId);
      if (!tournament) {
        return callback?.({ success: false, error: 'Torneio não encontrado.' });
      }

      const tournamentChannel = `tournament:${tournamentId}`;
      socket.join(tournamentChannel);

      const rounds = await tournamentRepository.findRoundsWithMatches(tournamentId);

      callback?.({
        success: true,
        tournament,
        rounds,
      });
    } catch (error) {
      logger.error(`[SOCKET TOURNAMENT ERROR] tournament:join_view falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Desconecta o cliente do canal do torneio.
   */
  socket.on('tournament:leave_view', ({ tournamentId }) => {
    const tournamentChannel = `tournament:${tournamentId}`;
    socket.leave(tournamentChannel);
  });

  /**
   * Difunde em tempo real a actualização das chaves eliminatórias para todos os espectadores conectados.
   */
  socket.on('tournament:bracket_updated', async ({ tournamentId }) => {
    try {
      const tournamentChannel = `tournament:${tournamentId}`;
      const rounds = await tournamentRepository.findRoundsWithMatches(tournamentId);

      io.to(tournamentChannel).emit('tournament:bracket_refresh', {
        tournamentId,
        rounds,
      });
    } catch (error) {
      logger.error(`[SOCKET TOURNAMENT ERROR] tournament:bracket_updated falhou:`, error.message);
    }
  });
};

export default registerTournamentHandlers;