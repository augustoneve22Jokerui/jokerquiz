import { roomService } from '../services/room.service.js';
import { roomRepository } from '../repositories/room.repository.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para Gestão de Salas Multiplayer, Lobbies e Arenas em Tempo Real.
 */
export const roomController = {
  /**
   * Renderiza a listagem de salas multiplayer públicas disponíveis e convites pendentes.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderList: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const difficulty = req.query.difficulty || null;
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;

      const [roomsResult, categories, pendingInvitations] = await Promise.all([
        roomRepository.findOpenRoomsPaginated({
          page,
          limit: 12,
          difficulty,
          categoryId,
        }),
        animeRepository.findAllCategories(true),
        roomRepository.findPendingInvitations(req.user.id),
      ]);

      res.render('pages/rooms/list', {
        title: 'Salas Multiplayer — Anime Quiz',
        layout: 'layouts/dashboard',
        rooms: roomsResult.rooms,
        totalRooms: roomsResult.total,
        totalPages: roomsResult.totalPages,
        currentPage: page,
        categories,
        pendingInvitations,
        selectedDifficulty: difficulty,
        selectedCategory: categoryId,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de criação de uma nova sala multiplayer.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderCreate: async (req, res, next) => {
    try {
      const categories = await animeRepository.findAllCategories(true);

      res.render('pages/rooms/create', {
        title: 'Criar Sala Multiplayer — Anime Quiz',
        layout: 'layouts/dashboard',
        categories,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a criação de uma sala multiplayer.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleCreate: async (req, res, next) => {
    try {
      const {
        name,
        isPrivate,
        password,
        maxPlayers,
        difficulty,
        categoryId,
        questionsCount,
        timePerQuestion,
      } = req.body;

      const room = await roomService.createRoom({
        hostUserId: req.user.id,
        name,
        isPrivate: Boolean(isPrivate),
        password: password || '',
        maxPlayers: parseInt(maxPlayers, 10) || 8,
        difficulty,
        categoryId: categoryId ? parseInt(categoryId, 10) : null,
        questionsCount: parseInt(questionsCount, 10) || 10,
        timePerQuestion: parseInt(timePerQuestion, 10) || 15,
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(201).json({
          success: true,
          room,
          redirect: `/rooms/lobby/${room.code}`,
        });
      }

      res.redirect(`/rooms/lobby/${room.code}`);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza o lobby de espera da sala multiplayer antes do início da partida.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderLobby: async (req, res, next) => {
    try {
      const { code } = req.params;

      const room = await roomRepository.findByCode(code);
      if (!room) {
        throw new AppError('Sala não encontrada ou já encerrada.', 404, 'ROOM_NOT_FOUND');
      }

      // Se a partida já estiver a decorrer, redireciona para a arena activa
      if (room.status === 'IN_GAME') {
        return res.redirect(`/rooms/arena/${room.code}`);
      }

      // Garante que o utilizador esteja registado como jogador na sala
      await roomRepository.addPlayer(room.id, req.user.id, room.host_user_id === req.user.id);

      const players = await roomRepository.findPlayersByRoomId(room.id);
      const isHost = room.host_user_id === req.user.id;

      res.render('pages/rooms/lobby', {
        title: `Lobby: ${room.name} [${room.code}] — Anime Quiz`,
        layout: 'layouts/game',
        room,
        players,
        isHost,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a entrada numa sala via código alfanumérico curto.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleJoinByCode: async (req, res, next) => {
    try {
      const { code, password } = req.body;

      const { room } = await roomService.joinRoomByCode({
        userId: req.user.id,
        code,
        password,
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          redirect: `/rooms/lobby/${room.code}`,
          room,
        });
      }

      res.redirect(`/rooms/lobby/${room.code}`);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a Arena Multiplayer em tempo real (HUD de Jogo Sincronizado por WebSocket).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderArena: async (req, res, next) => {
    try {
      const { code } = req.params;

      const room = await roomRepository.findByCode(code);
      if (!room) {
        throw new AppError('Sala não encontrada.', 404, 'ROOM_NOT_FOUND');
      }

      if (room.status !== 'IN_GAME') {
        return res.redirect(`/rooms/lobby/${room.code}`);
      }

      const players = await roomRepository.findPlayersByRoomId(room.id);
      const isHost = room.host_user_id === req.user.id;

      res.render('pages/rooms/arena', {
        title: `Arena: ${room.name} — Anime Quiz`,
        layout: 'layouts/game',
        room,
        players,
        isHost,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Envia um convite directo para outro jogador entrar na sala multiplayer.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleInvite: async (req, res, next) => {
    try {
      const { roomId, inviteeUserId } = req.body;

      const invitation = await roomRepository.createInvitation(
        roomId,
        req.user.id,
        inviteeUserId
      );

      res.status(201).json({
        success: true,
        message: 'Convite enviado com sucesso.',
        invitation,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default roomController;