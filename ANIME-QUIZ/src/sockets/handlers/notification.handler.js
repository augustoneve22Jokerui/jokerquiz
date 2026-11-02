import { notificationRepository } from '../../repositories/notification.repository.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Emite uma notificação em tempo real directamente para a ligação privada do utilizador.
 * Aciona o badge de alertas na barra de navegação e exibe um toast de aviso no ecrã.
 * 
 * @param {import('socket.io').Server} io
 * @param {string} userId - UUID do destinatário
 * @param {Object} notification - Dados da notificação
 */
export const emitNotificationToUser = (io, userId, notification) => {
  if (!io || !userId) return;

  const userRoom = `user:${userId}`;
  io.to(userRoom).emit('notification:new', {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    link: notification.link,
    createdAt: notification.created_at || new Date().toISOString(),
  });
};

/**
 * Manipulador de Eventos de WebSocket para Gestão de Notificações em Directo.
 * Permite leitura de alertas, actualização do contador de não lidas e sincronização entre abas.
 * 
 * @param {import('socket.io').Server} io - Instância principal do Socket.IO
 * @param {import('socket.io').Socket} socket - Conexão do jogador
 */
export const registerNotificationHandlers = (io, socket) => {
  const userId = socket.data.userId;

  /**
   * Consulta a contagem actual de notificações não lidas.
   */
  socket.on('notification:get_unread_count', async (callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, unreadCount: 0 });
      }

      const unreadCount = await notificationRepository.countUnread(userId);
      callback?.({ success: true, unreadCount });
    } catch (error) {
      logger.error(`[SOCKET NOTIFICATION ERROR] get_unread_count falhou:`, error.message);
      callback?.({ success: false, unreadCount: 0 });
    }
  });

  /**
   * Marca uma notificação individual como lida.
   */
  socket.on('notification:mark_as_read', async ({ notificationId }, callback) => {
    try {
      if (!userId || !notificationId) {
        return callback?.({ success: false, error: 'Parâmetros inválidos.' });
      }

      await notificationRepository.markAsRead(notificationId, userId);
      const newUnreadCount = await notificationRepository.countUnread(userId);

      // Sincroniza todas as conexões activas do mesmo utilizador (ex: telemóvel e computador)
      io.to(`user:${userId}`).emit('notification:count_updated', {
        unreadCount: newUnreadCount,
      });

      callback?.({ success: true, unreadCount: newUnreadCount });
    } catch (error) {
      logger.error(`[SOCKET NOTIFICATION ERROR] mark_as_read falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Marca todas as notificações do utilizador como lidas em simultâneo.
   */
  socket.on('notification:mark_all_read', async (callback) => {
    try {
      if (!userId) {
        return callback?.({ success: false, error: 'Não autenticado.' });
      }

      await notificationRepository.markAllAsRead(userId);

      io.to(`user:${userId}`).emit('notification:count_updated', {
        unreadCount: 0,
      });

      callback?.({ success: true, unreadCount: 0 });
    } catch (error) {
      logger.error(`[SOCKET NOTIFICATION ERROR] mark_all_read falhou:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });
};

export default registerNotificationHandlers;