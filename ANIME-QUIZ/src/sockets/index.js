import { socketAuthMiddleware } from './middlewares/socket-auth.middleware.js';
import { registerRoomHandlers } from './handlers/room.handler.js';
import { registerGameHandlers } from './handlers/game.handler.js';
import { registerTournamentHandlers } from './handlers/tournament.handler.js';
import { registerChatHandlers } from './handlers/chat.handler.js';
import {
  registerNotificationHandlers,
  emitNotificationToUser,
} from './handlers/notification.handler.js';
import { gameTimerManager } from './managers/game-timer.manager.js';
import { roomStateManager } from './managers/room-state.manager.js';
import { logger } from '../utils/logger.util.js';

/**
 * Inicializador e Orquestrador Central de Handlers do Socket.IO.
 * Aplica middlewares de autenticação de sessão e anexa manipuladores de domínio a cada conexão activa.
 * 
 * @param {import('socket.io').Server} io - Instância principal do servidor WebSocket
 */
export const registerSocketHandlers = (io) => {
  // 1. Aplica o middleware de autenticação baseado na sessão Express / PostgreSQL Neon
  io.use(socketAuthMiddleware);

  // 2. Manipulador do ciclo de conexão de clientes
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username || 'Visitante Anónimo';

    logger.debug(`[SOCKET CONNECTED] Cliente conectado: ${socket.id} (User: ${username} | ID: ${userId || 'N/A'})`);

    // 3. Registo modular dos manipuladores de eventos por domínio de negócio
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerTournamentHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerNotificationHandlers(io, socket);

    // 4. Tratamento do evento de desconexão
    socket.on('disconnect', (reason) => {
      logger.debug(`[SOCKET DISCONNECTED] Cliente desconectado: ${socket.id} (${username}) | Motivo: ${reason}`);
    });

    // 5. Tratamento de erros inesperados na conexão do socket
    socket.on('error', (err) => {
      logger.error(`[SOCKET CLIENT ERROR] Erro no socket ${socket.id}:`, err.message);
    });
  });

  logger.info('[WEBSOCKET INITIALIZED] Camada de tempo real do Socket.IO configurada com sucesso.');
};

export {
  emitNotificationToUser,
  gameTimerManager,
  roomStateManager,
};

export default registerSocketHandlers;