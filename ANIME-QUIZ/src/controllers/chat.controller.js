import { chatService } from '../services/chat.service.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para o Chat Comunitário em Tempo Real e Operações de Moderação de Conduta.
 */
export const chatController = {
  /**
   * Renderiza a página principal do Chat Global da Comunidade.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderGlobalChat: async (req, res, next) => {
    try {
      const { conversation, messages } = await chatService.getGlobalChatHistory(50);

      res.render('pages/chat/global', {
        title: 'Chat Global da Comunidade — Anime Quiz',
        layout: 'layouts/dashboard',
        conversation,
        messages,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa o envio de uma nova mensagem via HTTP (suporte alternativo ou fallback ao WebSocket).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleSendMessage: async (req, res, next) => {
    try {
      const { conversationId, content } = req.body;

      if (!conversationId) {
        throw new AppError('O identificador do canal de conversação é obrigatório.', 400, 'CONVERSATION_ID_REQUIRED');
      }

      const messagePayload = await chatService.sendMessage({
        conversationId,
        senderUserId: req.user.id,
        content,
      });

      res.status(201).json({
        success: true,
        data: messagePayload,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retorna o histórico de mensagens recente de um canal específico em formato JSON.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleGetHistory: async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 50;

      const { messages } = await chatService.getGlobalChatHistory(limit);

      res.status(200).json({
        success: true,
        conversationId,
        messages,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Executa a moderação e ocultação (Soft Delete) de uma mensagem ofensiva ou spam.
   * Acesso restrito a moderadores e administradores.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleModerateMessage: async (req, res, next) => {
    try {
      const { messageId, reason } = req.body;

      if (!messageId) {
        throw new AppError('O identificador da mensagem é obrigatório.', 400, 'MESSAGE_ID_REQUIRED');
      }

      const success = await chatService.moderateMessage({
        messageId,
        moderatorUser: req.user,
        reason: reason || 'Violação das directrizes de convivência',
      });

      res.status(200).json({
        success,
        message: 'Mensagem removida por acção de moderação.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Aplica sanção de silêncio (Mute) a um jogador que desrespeitou as directrizes.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleMutePlayer: async (req, res, next) => {
    try {
      const { conversationId, targetUserId, durationMinutes, reason } = req.body;

      if (!conversationId || !targetUserId) {
        throw new AppError('Identificadores de canal e utilizador são obrigatórios.', 400, 'INVALID_PARAMS');
      }

      const success = await chatService.mutePlayer({
        conversationId,
        targetUserId,
        moderatorUser: req.user,
        durationMinutes: parseInt(durationMinutes, 10) || 15,
        reason: reason || 'Comportamento tóxico',
      });

      res.status(200).json({
        success,
        message: 'Jogador silenciado temporariamente.',
      });
    } catch (error) {
      next(error);
    }
  },
};

export default chatController;