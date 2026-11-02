import { withTransaction } from '../database/connection.js';
import { roomRepository } from '../repositories/room.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { scoringService } from './scoring.service.js';
import { hashPassword, comparePassword } from '../utils/password.util.js';
import { generateRoomCode } from '../utils/token.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio para Gestão do Ciclo de Vida de Salas Multiplayer e Arenas em Tempo Real.
 */
export const roomService = {
  /**
   * Cria uma nova sala multiplayer, associa o anfitrião (Host) e cria o canal de chat correspondente.
   * 
   * @param {Object} data
   * @param {string} data.hostUserId - UUID
   * @param {string} data.name
   * @param {boolean} [data.isPrivate=false]
   * @param {string} [data.password]
   * @param {number} [data.maxPlayers=8]
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} data.difficulty
   * @param {number|null} [data.categoryId=null]
   * @param {number} [data.questionsCount=10]
   * @param {number} [data.timePerQuestion=15]
   * @returns {Promise<Object>} Dados da sala criada
   */
  createRoom: async ({
    hostUserId,
    name,
    isPrivate = false,
    password = '',
    maxPlayers = 8,
    difficulty,
    categoryId = null,
    questionsCount = 10,
    timePerQuestion = 15,
  }) => {
    return await withTransaction(async (client) => {
      // 1. Gera código curto único de acesso (ex: 'AKAT99')
      let code = generateRoomCode(6);
      let existingRoom = await roomRepository.findByCode(code, client);
      while (existingRoom) {
        code = generateRoomCode(6);
        existingRoom = await roomRepository.findByCode(code, client);
      }

      // 2. Hasheia a palavra-passe se a sala for privada
      let passwordHash = null;
      if (isPrivate && password) {
        passwordHash = await hashPassword(password);
      }

      // 3. Persiste a sala
      const room = await roomRepository.create(
        {
          code,
          name,
          hostUserId,
          isPrivate,
          passwordHash,
          maxPlayers,
          difficulty,
          categoryId,
          questionsCount,
          timePerQuestion,
        },
        client
      );

      // 4. Regista o anfitrião como primeiro jogador da sala
      await roomRepository.addPlayer(room.id, hostUserId, true, client);

      // 5. Cria o canal de conversação da sala
      await chatRepository.getOrCreateRoomConversation(room.id, room.name, client);

      logger.info(`Sala multiplayer criada: Código=${code} | Nome=${name} | Host=${hostUserId}`);

      return room;
    });
  },

  /**
   * Permite a entrada de um jogador numa sala através do código de acesso alfanumérico.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {string} data.code
   * @param {string} [data.password]
   * @returns {Promise<Object>} Sala e dados do jogador
   */
  joinRoomByCode: async ({ userId, code, password = '' }) => {
    const room = await roomRepository.findByCode(code);
    if (!room) {
      throw new AppError('Sala não encontrada ou partida já encerrada.', 404, 'ROOM_NOT_FOUND');
    }

    if (room.status !== 'LOBBY') {
      throw new AppError('Esta partida já está a decorrer e não aceita novos participantes.', 400, 'ROOM_IN_PROGRESS');
    }

    const currentPlayersCount = parseInt(room.current_players_count || 0, 10);
    if (currentPlayersCount >= room.max_players) {
      throw new AppError('A sala atingiu o limite máximo de jogadores suportados.', 400, 'ROOM_FULL');
    }

    // Se for privada, valida palavra-passe
    if (room.is_private) {
      if (!password || !room.password_hash) {
        throw new AppError('Esta sala é privada e exige uma palavra-passe.', 403, 'PASSWORD_REQUIRED');
      }
      const isPasswordValid = await comparePassword(password, room.password_hash);
      if (!isPasswordValid) {
        throw new AppError('Palavra-passe da sala incorrecta.', 401, 'INVALID_ROOM_PASSWORD');
      }
    }

    // Adiciona o jogador à sala
    const playerRecord = await roomRepository.addPlayer(room.id, userId, false);

    // Integra o jogador no canal de chat da sala
    const conversation = await chatRepository.getOrCreateRoomConversation(room.id, room.name);
    await chatRepository.addMember(conversation.id, userId, 'MEMBER');

    logger.info(`Jogador ${userId} entrou na sala ${room.code} (${room.id})`);

    return {
      room,
      playerRecord,
    };
  },

  /**
   * Permite a saída de um jogador da sala com transferência automática de host se necessário.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @returns {Promise<{ newHostId: string|null, isClosed: boolean }>}
   */
  leaveRoom: async (roomId, userId) => {
    return await withTransaction(async (client) => {
      const room = await roomRepository.findById(roomId, client);
      if (!room) return { newHostId: null, isClosed: true };

      // Remove o jogador
      await roomRepository.removePlayer(roomId, userId, client);

      const remainingPlayers = await roomRepository.findPlayersByRoomId(roomId, client);

      // Se a sala ficou vazia, encerra a sala
      if (remainingPlayers.length === 0) {
        await roomRepository.updateStatus(roomId, 'CANCELLED', client);
        logger.info(`Sala ${roomId} encerrada por ausência de jogadores.`);
        return { newHostId: null, isClosed: true };
      }

      // Se o anfitrião saiu, transfere a liderança para o próximo jogador mais antigo
      let newHostId = null;
      if (room.host_user_id === userId) {
        const nextHost = remainingPlayers[0];
        newHostId = nextHost.user_id;

        await client.query(
          `UPDATE rooms SET host_user_id = $2 WHERE id = $1;`,
          [roomId, newHostId]
        );
        await client.query(
          `UPDATE room_players SET is_host = TRUE, is_ready = TRUE WHERE room_id = $1 AND user_id = $2;`,
          [roomId, newHostId]
        );

        logger.info(`Liderança da sala ${roomId} transferida para o jogador: ${newHostId}`);
      }

      return { newHostId, isClosed: false };
    });
  },

  /**
   * Alterna o estado de prontidão de um participante no lobby.
   * 
   * @param {string} roomId - UUID
   * @param {string} userId - UUID
   * @param {boolean} isReady
   * @returns {Promise<boolean>}
   */
  togglePlayerReady: async (roomId, userId, isReady) => {
    return await roomRepository.setPlayerReady(roomId, userId, isReady);
  },

  /**
   * Inicia formalmente a partida multiplayer.
   * Valida autorização de anfitrião e carrega perguntas com gabarito seguro.
   * 
   * @param {string} roomId - UUID
   * @param {string} hostUserId - UUID
   * @returns {Promise<{ room: Object, questions: Array<Object> }>}
   */
  startGame: async (roomId, hostUserId) => {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Sala não encontrada.', 404, 'ROOM_NOT_FOUND');
    }

    if (room.host_user_id !== hostUserId) {
      throw new AppError('Apenas o anfitrião possui permissão para iniciar a partida.', 403, 'FORBIDDEN_START');
    }

    if (room.status !== 'LOBBY') {
      throw new AppError('A partida já se encontra em andamento ou foi finalizada.', 400, 'INVALID_ROOM_STATE');
    }

    const players = await roomRepository.findPlayersByRoomId(roomId);
    if (players.length < 2) {
      throw new AppError('São necessários pelo menos 2 jogadores no lobby para iniciar.', 400, 'INSUFFICIENT_PLAYERS');
    }

    // Busca as perguntas com alternativas sem gabarito
    const questions = await quizRepository.findRandomQuestions({
      difficulty: room.difficulty,
      categoryId: room.category_id,
      limit: room.questions_count,
    });

    if (!questions || questions.length === 0) {
      throw new AppError('Perguntas insuficientes para os parâmetros definidos nesta sala.', 400, 'NO_QUESTIONS_AVAILABLE');
    }

    // Actualiza o estado da sala para 'IN_GAME'
    await roomRepository.updateStatus(roomId, 'IN_GAME');

    logger.info(`Partida iniciada na sala ${room.code} (${roomId}) com ${players.length} jogadores.`);

    return {
      room,
      questions: questions.map((q, idx) => ({
        index: idx + 1,
        id: q.id,
        text: q.question_text,
        imageUrl: q.image_url,
        timeLimitSeconds: room.time_per_question,
        options: q.options || [],
      })),
    };
  },

  /**
   * Avalia a submissão de uma resposta por um participante durante a partida multiplayer.
   * 
   * @param {Object} data
   * @param {string} data.roomId - UUID
   * @param {string} data.userId - UUID
   * @param {number} data.questionId
   * @param {number|null} [data.answerId=null]
   * @param {number} data.responseTimeMs
   * @param {number} [data.currentStreak=0]
   * @returns {Promise<Object>}
   */
  submitAnswer: async ({
    roomId,
    userId,
    questionId,
    answerId = null,
    responseTimeMs,
    currentStreak = 0,
  }) => {
    const room = await roomRepository.findById(roomId);
    if (!room || room.status !== 'IN_GAME') {
      throw new AppError('A partida da sala não se encontra activa.', 400, 'ROOM_NOT_ACTIVE');
    }

    const question = await quizRepository.findQuestionWithAnswers(questionId);
    if (!question) {
      throw new AppError('Pergunta não encontrada.', 404, 'QUESTION_NOT_FOUND');
    }

    // Tolerância de cronómetro de rede (2000ms)
    const maxAllowedTimeMs = (room.time_per_question * 1000) + 2000;
    const isTimeout = responseTimeMs > maxAllowedTimeMs;

    let isCorrect = false;
    if (!isTimeout && answerId) {
      isCorrect = await quizRepository.verifyAnswer(questionId, answerId);
    }

    let pointsAwarded = 0;
    let xpAwarded = 0;

    if (isCorrect) {
      const scoring = scoringService.calculateQuestionScore({
        basePoints: question.base_points || 100,
        baseXp: question.base_xp || 25,
        difficulty: room.difficulty,
        timeLimitSeconds: room.time_per_question,
        responseTimeMs,
        currentStreak,
      });

      pointsAwarded = scoring.pointsAwarded;
      xpAwarded = scoring.xpAwarded;

      // Actualiza o placar do jogador na sala
      await roomRepository.updatePlayerScore(roomId, userId, pointsAwarded, true);
    } else {
      await roomRepository.updatePlayerScore(roomId, userId, 0, false);
    }

    const correctAnswer = question.answers?.find((a) => a.isCorrect === true);

    return {
      isCorrect,
      isTimeout,
      pointsAwarded,
      xpAwarded,
      correctAnswerId: correctAnswer?.id || null,
      explanation: question.explanation || '',
    };
  },

  /**
   * Finaliza a partida multiplayer, consolida as colocações e credita o progresso aos participantes.
   * 
   * @param {string} roomId - UUID
   * @returns {Promise<{ podium: Array<Object>, totalPlayers: number }>}
   */
  finishGame: async (roomId) => {
    return await withTransaction(async (client) => {
      // 1. Marca a sala como 'FINISHED'
      await roomRepository.updateStatus(roomId, 'FINISHED', client);

      // 2. Consulta a classificação final por pontuação
      const players = await roomRepository.findPlayersByRoomId(roomId, client);

      // 3. Atribui colocações e credita XP nos perfis dos jogadores
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const rankPosition = i + 1;
        const isWin = rankPosition === 1; // Apenas o 1º lugar recebe vitória de sala

        // Bónus de XP por colocação: 1º (+200 XP), 2º (+100 XP), 3º (+50 XP)
        const placementBonusXp = rankPosition === 1 ? 200 : rankPosition === 2 ? 100 : rankPosition === 3 ? 50 : 20;
        const totalXpEarned = (player.correct_answers * 25) + placementBonusXp;

        const profile = await profileRepository.findByUserId(player.user_id, client);
        if (profile) {
          const newTotalXp = parseInt(profile.xp, 10) + totalXpEarned;
          const levelProgress = scoringService.calculateLevelProgress(newTotalXp);

          await profileRepository.recordMatchResult(
            player.user_id,
            {
              isWin,
              xpToAdd: totalXpEarned,
              scoreToAdd: player.score,
              newLevel: levelProgress.currentLevel,
              newRankTier: levelProgress.rankTier,
            },
            client
          );
        }

        // Regista a colocação final do jogador na tabela da sala
        await client.query(
          `UPDATE room_players SET rank_position = $3 WHERE room_id = $1 AND user_id = $2;`,
          [roomId, player.user_id, rankPosition]
        );
      }

      logger.info(`Partida finalizada na sala ${roomId} com ${players.length} jogadores classificados.`);

      return {
        podium: players.slice(0, 3).map((p, idx) => ({
          position: idx + 1,
          userId: p.user_id,
          username: p.username,
          displayName: p.display_name,
          avatarUrl: p.avatar_url,
          score: p.score,
          correctAnswers: p.correct_answers,
        })),
        totalPlayers: players.length,
      };
    });
  },
};

export default roomService;