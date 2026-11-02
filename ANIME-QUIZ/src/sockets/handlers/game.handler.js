import { roomService } from '../../services/room.service.js';
import { roomRepository } from '../../repositories/room.repository.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Manipulador de Eventos de WebSocket para a Arena de Jogo Multiplayer em Tempo Real.
 * Coordena submissão de respostas, actualização em directo do placar e consagração do pódio.
 * 
 * @param {import('socket.io').Server} io - Instância principal do Socket.IO
 * @param {import('socket.io').Socket} socket - Conexão do competidor
 */
export const registerGameHandlers = (io, socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;

  /**
   * Conexão e sincronização do jogador com a arena de jogo activa.
   */
  socket.on('game:join_arena', async ({ roomId }, callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, error: 'Autenticação necessária.' });
      }

      const room = await roomRepository.findById(roomId);
      if (!room) {
        return callback?.({ success: false, error: 'Arena não encontrada.' });
      }

      const arenaChannel = `arena:${roomId}`;
      socket.join(arenaChannel);

      const players = await roomRepository.findPlayersByRoomId(roomId);

      // Notifica todos na arena sobre o placar em tempo real
      io.to(arenaChannel).emit('game:scoreboard_update', {
        players: players.map((p) => ({
          userId: p.user_id,
          username: p.username,
          displayName: p.display_name,
          avatarUrl: p.avatar_url,
          score: p.score,
          rankTier: p.rank_tier,
          isHost: p.is_host,
        })),
      });

      callback?.({ success: true, room, players });
    } catch (error) {
      logger.error(`[SOCKET GAME ERROR] game:join_arena falhou para user ${userId}:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Submissão de resposta a uma pergunta com validação autoritativa no servidor.
   */
  socket.on('game:submit_answer', async ({ roomId, questionId, answerId, clientTimeMs, currentStreak }, callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, error: 'Não autenticado.' });
      }

      const evaluation = await roomService.submitAnswer({
        roomId,
        userId,
        questionId: parseInt(questionId, 10),
        answerId: answerId ? parseInt(answerId, 10) : null,
        responseTimeMs: parseInt(clientTimeMs, 10) || 0,
        currentStreak: parseInt(currentStreak, 10) || 0,
      });

      const arenaChannel = `arena:${roomId}`;
      const players = await roomRepository.findPlayersByRoomId(roomId);

      // Emite o placar recalculado instantaneamente para todos os competidores na arena
      io.to(arenaChannel).emit('game:scoreboard_update', {
        players: players.map((p) => ({
          userId: p.user_id,
          username: p.username,
          displayName: p.display_name,
          avatarUrl: p.avatar_url,
          score: p.score,
          rankTier: p.rank_tier,
        })),
        lastScorer: evaluation.isCorrect
          ? {
              userId,
              points: evaluation.pointsAwarded,
              streak: (parseInt(currentStreak, 10) || 0) + 1,
            }
          : null,
      });

      // Retorna o resultado individual apenas ao jogador que respondeu
      callback?.({
        success: true,
        evaluation,
      });
    } catch (error) {
      logger.error(`[SOCKET GAME ERROR] game:submit_answer falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Distribuição de uma nova pergunta para todos os ecrãs sincronizados (Disparada pelo Host ou Manager).
   */
  socket.on('game:broadcast_question', async ({ roomId, questionIndex, questionData }) => {
    try {
      const room = await roomRepository.findById(roomId);
      if (!room || room.host_user_id !== userId) return;

      const arenaChannel = `arena:${roomId}`;

      io.to(arenaChannel).emit('game:new_question', {
        questionIndex,
        question: questionData,
        timeLimitSeconds: room.time_per_question,
      });
    } catch (error) {
      logger.error(`[SOCKET GAME ERROR] game:broadcast_question falhou:`, error.message);
    }
  });

  /**
   * Finalização da partida, consolidação do pódio e atribuição de recompensas aos competidores.
   */
  socket.on('game:finish', async ({ roomId }, callback) => {
    try {
      const room = await roomRepository.findById(roomId);
      if (!room || room.host_user_id !== userId) {
        return callback?.({ success: false, error: 'Apenas o anfitrião pode consolidar o fim da partida.' });
      }

      const summary = await roomService.finishGame(roomId);
      const arenaChannel = `arena:${roomId}`;

      // Emite o ecrã comemorativo de encerramento e pódio para todos na arena
      io.to(arenaChannel).emit('game:ended', {
        podium: summary.podium,
        totalPlayers: summary.totalPlayers,
      });

      callback?.({ success: true, summary });
    } catch (error) {
      logger.error(`[SOCKET GAME ERROR] game:finish falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });
};

export default registerGameHandlers;