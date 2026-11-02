import { chatService } from '../../services/chat.service.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Manipulador de Eventos de WebSocket para o Chat em Tempo Real.
 * Gere canais de conversação (Global, Salas, Torneios), difusão de mensagens e indicadores de digitação.
 * 
 * @param {import('socket.io').Server} io - Instância principal do Socket.IO
 * @param {import('socket.io').Socket} socket - Conexão do jogador
 */
export const registerChatHandlers = (io, socket) => {
  const userId = socket.data.userId;
  const displayName = socket.data.displayName || socket.data.username || 'Competidor';

  /**
   * Entrada do socket num canal de chat específico.
   */
  socket.on('chat:join_channel', ({ conversationId }, callback) => {
    try {
      if (!conversationId) {
        return callback?.({ success: false, error: 'Identificador de canal obrigatório.' });
      }

      const channel = `chat:${conversationId}`;
      socket.join(channel);

      callback?.({ success: true, conversationId });
    } catch (error) {
      logger.error(`[SOCKET CHAT ERROR] chat:join_channel falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Saída do socket de um canal de chat.
   */
  socket.on('chat:leave_channel', ({ conversationId }) => {
    if (conversationId) {
      const channel = `chat:${conversationId}`;
      socket.leave(channel);
    }
  });

  /**
   * Envio de mensagem com persistência em banco e difusão em tempo real.
   */
  socket.on('chat:send_message', async ({ conversationId, content }, callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, error: 'É necessário iniciar sessão para enviar mensagens.' });
      }

      // Valida, persiste e sanitiza através do serviço de chat
      const messagePayload = await chatService.sendMessage({
        conversationId,
        senderUserId: userId,
        content,
      });

      const channel = `chat:${conversationId}`;

      // Difunde a mensagem formatada para todos os membros do canal
      io.to(channel).emit('chat:new_message', messagePayload);

      callback?.({ success: true, message: messagePayload });
    } catch (error) {
      logger.error(`[SOCKET CHAT ERROR] chat:send_message falhou para user ${userId}:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Notificação de digitação activa (Typing Indicator).
   */
  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    if (!conversationId || !userId) return;

    const channel = `chat:${conversationId}`;

    // Emite para os restantes membros da conversa, excluindo o emissor original
    socket.to(channel).emit('chat:user_typing', {
      userId,
      displayName,
      isTyping: Boolean(isTyping),
    });
  });
};

export default registerChatHandlers;