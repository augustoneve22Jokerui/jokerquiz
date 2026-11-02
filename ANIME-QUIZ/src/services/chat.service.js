import { chatRepository } from '../repositories/chat.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio do Chat em Tempo Real, Canais Comunitários e Moderação de Conduta.
 */
export const chatService = {
  /**
   * Envia e persiste uma mensagem num canal de chat após validação de sanções de silêncio (Mute).
   * 
   * @param {Object} data
   * @param {string} data.conversationId - UUID
   * @param {string} data.senderUserId - UUID
   * @param {string} data.content - Texto da mensagem
   * @returns {Promise<Object>} Mensagem formatada com metadados do remetente
   */
  sendMessage: async ({ conversationId, senderUserId, content }) => {
    // 1. Sanitização do conteúdo
    const cleanContent = content ? content.trim() : '';
    if (!cleanContent || cleanContent.length === 0) {
      throw new AppError('O conteúdo da mensagem não pode estar vazio.', 400, 'EMPTY_MESSAGE');
    }

    if (cleanContent.length > 1000) {
      throw new AppError('A mensagem não pode exceder 1000 caracteres.', 400, 'MESSAGE_TOO_LONG');
    }

    // 2. Validação de existência do canal
    const conversation = await chatRepository.findConversationById(conversationId);
    if (!conversation || !conversation.is_active) {
      throw new AppError('Canal de conversação inválido ou inactivo.', 404, 'CONVERSATION_NOT_FOUND');
    }

    // 3. Verificação de Sanção de Silêncio Activa (Anti-Toxicidade)
    const isMuted = await chatRepository.isUserMuted(conversationId, senderUserId);
    if (isMuted) {
      throw new AppError(
        'A sua conta encontra-se temporariamente silenciada neste canal pelas directrizes da comunidade.',
        403,
        'USER_MUTED'
      );
    }

    // 4. Persiste a mensagem na tabela messages
    const message = await chatRepository.createMessage({
      conversationId,
      senderUserId,
      content: cleanContent,
    });

    // 5. Carrega o perfil do emissor para visualização em tempo real
    const profile = await profileRepository.findByUserId(senderUserId);

    logger.debug(`Mensagem enviada no canal ${conversationId} pelo utilizador: ${senderUserId}`);

    return {
      id: message.id,
      conversationId: message.conversation_id,
      senderUserId: message.sender_user_id,
      content: message.content,
      createdAt: message.created_at,
      sender: {
        username: profile?.username || 'Gamer',
        displayName: profile?.display_name || 'Competidor',
        avatarUrl: profile?.avatar_url || '/assets/images/placeholders/default-avatar.png',
        rankTier: profile?.rank_tier || 'ESTUDANTE_ACADEMIA',
        level: profile?.level || 1,
      },
    };
  },

  /**
   * Obtém o histórico recente de mensagens do canal Global de conversação.
   * 
   * @param {number} [limit=50]
   * @returns {Promise<{ conversation: Object, messages: Array<Object> }>}
   */
  getGlobalChatHistory: async (limit = 50) => {
    const conversation = await chatRepository.getOrCreateGlobalConversation();
    const messages = await chatRepository.findRecentMessages(conversation.id, limit);

    return {
      conversation,
      messages,
    };
  },

  /**
   * Obtém o histórico de mensagens de uma sala multiplayer específica.
   * 
   * @param {string} roomId - UUID
   * @param {string} roomName
   * @param {number} [limit=50]
   * @returns {Promise<{ conversation: Object, messages: Array<Object> }>}
   */
  getRoomChatHistory: async (roomId, roomName, limit = 50) => {
    const conversation = await chatRepository.getOrCreateRoomConversation(roomId, roomName);
    const messages = await chatRepository.findRecentMessages(conversation.id, limit);

    return {
      conversation,
      messages,
    };
  },

  /**
   * Oculta uma mensagem ofensiva (Soft Delete) através de acção de moderação.
   * 
   * @param {Object} data
   * @param {string} data.messageId - UUID
   * @param {Object} data.moderatorUser - Utilizador autenticado (Admin/Mod)
   * @param {string} [data.reason]
   * @returns {Promise<boolean>}
   */
  moderateMessage: async ({
    messageId,
    moderatorUser,
    reason = 'Violação das directrizes da comunidade',
  }) => {
    const isStaff =
      moderatorUser.role === 'ADMIN' ||
      moderatorUser.role === 'MODERATOR' ||
      moderatorUser.roles?.includes('ADMIN') ||
      moderatorUser.roles?.includes('MODERATOR');

    if (!isStaff) {
      throw new AppError('Não possui privilégios para moderar mensagens.', 403, 'FORBIDDEN');
    }

    const success = await chatRepository.softDeleteMessage(messageId, moderatorUser.id, reason);

    if (success) {
      await auditRepository.createAuditLog({
        adminUserId: moderatorUser.id,
        action: 'DELETE_CHAT_MESSAGE',
        targetEntity: 'messages',
        targetId: messageId,
        notes: `Mensagem ocultada por moderação: ${reason}`,
      });
      logger.audit('DELETE_CHAT_MESSAGE', { moderatorId: moderatorUser.id, messageId, reason });
    }

    return success;
  },

  /**
   * Aplica silêncio temporário (Mute) a um jogador que violou as regras de conduta.
   * 
   * @param {Object} data
   * @param {string} data.conversationId - UUID
   * @param {string} data.targetUserId - UUID do jogador advertido
   * @param {Object} data.moderatorUser - Moderador responsável
   * @param {number} [data.durationMinutes=15]
   * @param {string} [data.reason]
   * @returns {Promise<boolean>}
   */
  mutePlayer: async ({
    conversationId,
    targetUserId,
    moderatorUser,
    durationMinutes = 15,
    reason = 'Comportamento tóxico ou conduta antidesportiva',
  }) => {
    const isStaff =
      moderatorUser.role === 'ADMIN' ||
      moderatorUser.role === 'MODERATOR' ||
      moderatorUser.roles?.includes('ADMIN');

    if (!isStaff) {
      throw new AppError('Não possui privilégios para silenciar competidores.', 403, 'FORBIDDEN');
    }

    // Impede que moderadores apliquem mutes contra si mesmos ou outros administradores
    if (targetUserId === moderatorUser.id) {
      throw new AppError('Não pode aplicar uma acção disciplinar contra si próprio.', 400, 'INVALID_TARGET');
    }

    const success = await chatRepository.muteUser(conversationId, targetUserId, durationMinutes);

    if (success) {
      // Envia notificação disciplinar ao utilizador sancionado
      await notificationRepository.create({
        userId: targetUserId,
        title: 'Canal Silenciado Temporariamente',
        message: `Foi-lhe aplicada uma sanção de silêncio de ${durationMinutes} minutos no chat: ${reason}.`,
        type: 'SECURITY',
        link: '/chat',
      });

      // Grava no log de auditoria
      await auditRepository.createAuditLog({
        adminUserId: moderatorUser.id,
        action: 'MUTE_PLAYER',
        targetEntity: 'conversation_members',
        targetId: targetUserId,
        notes: `Duração: ${durationMinutes}min | Canal: ${conversationId} | Motivo: ${reason}`,
      });

      logger.audit('MUTE_PLAYER', {
        moderatorId: moderatorUser.id,
        targetUserId,
        durationMinutes,
        reason,
      });
    }

    return success;
  },
};

export default chatService;