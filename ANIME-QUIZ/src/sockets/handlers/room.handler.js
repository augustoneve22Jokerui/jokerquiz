import { roomService } from '../../services/room.service.js';
import { roomRepository } from '../../repositories/room.repository.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Manipulador de Eventos de WebSocket para o Ciclo de Vida de Salas Multiplayer (Lobbies).
 * Gere sincronização de presenças, estado de prontidão (Ready), expulsões e arranque de partidas.
 * 
 * @param {import('socket.io').Server} io - Instância principal do Socket.IO
 * @param {import('socket.io').Socket} socket - Conexão do jogador
 */
export const registerRoomHandlers = (io, socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;

  /**
   * Entrada na sala e anúncio da presença aos restantes jogadores.
   */
  socket.on('room:join', async ({ roomId }, callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, error: 'Autenticação necessária.' });
      }

      const room = await roomRepository.findById(roomId);
      if (!room) {
        return callback?.({ success: false, error: 'Sala não encontrada.' });
      }

      const roomChannel = `room:${roomId}`;
      socket.join(roomChannel);

      const players = await roomRepository.findPlayersByRoomId(roomId);

      // Notifica todos na sala com a lista actualizada de participantes
      io.to(roomChannel).emit('room:players_updated', {
        players,
        message: `${socket.data.displayName || username} juntou-se ao lobby.`,
      });

      callback?.({ success: true, room, players });
    } catch (error) {
      logger.error(`[SOCKET ROOM ERROR] room:join falhou para user ${userId}:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Alterna o estado de prontidão (Ready / Not Ready) do jogador no lobby.
   */
  socket.on('room:ready', async ({ roomId, isReady }, callback) => {
    try {
      if (!userId) return callback?.({ success: false, error: 'Não autenticado.' });

      await roomService.togglePlayerReady(roomId, userId, Boolean(isReady));

      const players = await roomRepository.findPlayersByRoomId(roomId);
      const roomChannel = `room:${roomId}`;

      io.to(roomChannel).emit('room:players_updated', {
        players,
        updatedUserId: userId,
        isReady: Boolean(isReady),
      });

      // Valida se todos os participantes (mínimo 2) estão prontos
      const nonHostPlayers = players.filter((p) => !p.is_host);
      const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every((p) => p.is_ready);

      if (allReady) {
        io.to(roomChannel).emit('room:all_ready', { canStart: true });
      }

      callback?.({ success: true, isReady: Boolean(isReady) });
    } catch (error) {
      logger.error(`[SOCKET ROOM ERROR] room:ready falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Expulsa um participante do lobby (Acesso exclusivo do anfitrião/Host).
   */
  socket.on('room:kick', async ({ roomId, targetUserId }, callback) => {
    try {
      if (!userId) return callback?.({ success: false, error: 'Não autenticado.' });

      const room = await roomRepository.findById(roomId);
      if (!room || room.host_user_id !== userId) {
        return callback?.({ success: false, error: 'Apenas o anfitrião pode expulsar jogadores.' });
      }

      await roomService.leaveRoom(roomId, targetUserId);

      const roomChannel = `room:${roomId}`;
      const players = await roomRepository.findPlayersByRoomId(roomId);

      // Emite evento directo para a sala privada do utilizador expulso
      io.to(`user:${targetUserId}`).emit('room:kicked', {
        roomId,
        reason: 'Foi removido do lobby pelo anfitrião da sala.',
      });

      // Notifica a sala da saída
      io.to(roomChannel).emit('room:players_updated', {
        players,
        message: 'Um jogador foi removido pelo anfitrião.',
      });

      callback?.({ success: true });
    } catch (error) {
      logger.error(`[SOCKET ROOM ERROR] room:kick falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Inicia formalmente a partida multiplayer após autorização do anfitrião.
   */
  socket.on('room:start', async ({ roomId }, callback) => {
    try {
      if (!userId) return callback?.({ success: false, error: 'Não autenticado.' });

      const gameData = await roomService.startGame(roomId, userId);
      const roomChannel = `room:${roomId}`;

      // Emite contagem decrescente para todos os ecrãs sincronizados
      io.to(roomChannel).emit('room:game_starting', {
        countdownSeconds: 3,
        redirectUrl: `/rooms/arena/${gameData.room.code}`,
      });

      callback?.({ success: true });
    } catch (error) {
      logger.error(`[SOCKET ROOM ERROR] room:start falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Desconexão ou saída voluntária da sala com transferência de host se aplicável.
   */
  socket.on('room:leave', async ({ roomId }, callback) => {
    try {
      if (!userId) return callback?.({ success: false });

      const roomChannel = `room:${roomId}`;
      socket.leave(roomChannel);

      const { newHostId, isClosed } = await roomService.leaveRoom(roomId, userId);

      if (!isClosed) {
        const players = await roomRepository.findPlayersByRoomId(roomId);
        io.to(roomChannel).emit('room:players_updated', {
          players,
          newHostId,
          message: `${socket.data.displayName || username} saiu do lobby.`,
        });
      } else {
        io.to(roomChannel).emit('room:closed', { reason: 'A sala foi encerrada.' });
      }

      callback?.({ success: true });
    } catch (error) {
      logger.error(`[SOCKET ROOM ERROR] room:leave falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });
};

export default registerRoomHandlers;