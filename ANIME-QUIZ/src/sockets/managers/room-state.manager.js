import { gameTimerManager } from './game-timer.manager.js';

/**
 * Gestor de Estado em Memória para Partidas Multiplayer Activas.
 * Coordena o avanço sincronizado de perguntas, placares instantâneos e
 * verificação de respostas concluídas por todos os jogadores na arena.
 */
class RoomStateManager {
  constructor() {
    /**
     * Mapa de estados em memória indexados por roomId.
     * @type {Map<string, Object>}
     */
    this.rooms = new Map();
  }

  /**
   * Inicializa o estado volátil da partida multiplayer quando o Host dispara o arranque.
   * 
   * @param {string} roomId - UUID da sala
   * @param {Object} data
   * @param {Array<Object>} data.questions - Perguntas seleccionadas para a partida
   * @param {Array<Object>} data.players - Jogadores presentes no lobby
   * @param {number} [data.timePerQuestion=15] - Duração oficial em segundos
   * @returns {Object} Estado inicializado
   */
  initRoomState(roomId, { questions, players, timePerQuestion = 15 }) {
    const playerScores = new Map();

    players.forEach((p) => {
      playerScores.set(p.user_id, {
        userId: p.user_id,
        username: p.username,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        score: 0,
        correctAnswers: 0,
        streak: 0,
      });
    });

    const state = {
      roomId,
      questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      timePerQuestion,
      playerScores,
      answersSubmittedCurrentQuestion: new Map(), // userId -> { answerId, isCorrect, points }
      status: 'STARTING', // 'STARTING', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'FINISHED'
    };

    this.rooms.set(roomId, state);
    return state;
  }

  /**
   * Obtém o estado activo de uma sala em memória.
   * 
   * @param {string} roomId
   * @returns {Object|null}
   */
  getRoomState(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Regista a resposta submetida por um jogador na pergunta corrente.
   * 
   * @param {string} roomId
   * @param {string} userId
   * @param {Object} answerData
   * @param {number|null} answerData.answerId
   * @param {boolean} answerData.isCorrect
   * @param {number} answerData.pointsAwarded
   * @returns {{ allAnswered: boolean, updatedScore: Object }}
   */
  recordPlayerAnswer(roomId, userId, { answerId, isCorrect, pointsAwarded }) {
    const state = this.rooms.get(roomId);
    if (!state) return { allAnswered: false, updatedScore: null };

    // Regista na pergunta actual
    state.answersSubmittedCurrentQuestion.set(userId, {
      answerId,
      isCorrect,
      pointsAwarded,
    });

    // Actualiza o placar consolidado do jogador
    const playerStats = state.playerScores.get(userId);
    if (playerStats) {
      playerStats.score += pointsAwarded;
      if (isCorrect) {
        playerStats.correctAnswers += 1;
        playerStats.streak += 1;
      } else {
        playerStats.streak = 0;
      }
    }

    // Valida se todos os participantes responderam antes do tempo limite
    const totalActivePlayers = state.playerScores.size;
    const answeredCount = state.answersSubmittedCurrentQuestion.size;
    const allAnswered = answeredCount >= totalActivePlayers;

    return {
      allAnswered,
      updatedScore: playerStats,
    };
  }

  /**
   * Retorna a pergunta activa correspondente ao índice corrente.
   * 
   * @param {string} roomId
   * @returns {Object|null}
   */
  getCurrentQuestion(roomId) {
    const state = this.rooms.get(roomId);
    if (!state || state.currentQuestionIndex >= state.totalQuestions) {
      return null;
    }
    return state.questions[state.currentQuestionIndex] || null;
  }

  /**
   * Avança a sala para a pergunta seguinte e limpa o mapa temporário de submissões.
   * 
   * @param {string} roomId
   * @returns {{ hasNextQuestion: boolean, nextIndex: number, nextQuestion: Object|null }}
   */
  advanceToNextQuestion(roomId) {
    const state = this.rooms.get(roomId);
    if (!state) return { hasNextQuestion: false, nextIndex: 0, nextQuestion: null };

    state.currentQuestionIndex += 1;
    state.answersSubmittedCurrentQuestion.clear();

    const hasNextQuestion = state.currentQuestionIndex < state.totalQuestions;
    const nextQuestion = hasNextQuestion ? state.questions[state.currentQuestionIndex] : null;

    state.status = hasNextQuestion ? 'QUESTION_ACTIVE' : 'FINISHED';

    return {
      hasNextQuestion,
      next