import { withTransaction } from '../database/connection.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Multiplicadores de pontuação e XP conforme a dificuldade oficial.
 */
const DIFFICULTY_MULTIPLIERS = {
  INICIANTE: 1.0,
  MEDIO: 1.5,
  PROFISSIONAL: 2.2,
  HOKAGE: 3.5,
};

/**
 * Limite de XP para cálculo de nível do jogador: Nível = floor(sqrt(XP / 100)) + 1.
 * 
 * @param {number} totalXp
 * @returns {number} Nível calculado
 */
const calculatePlayerLevel = (totalXp) => {
  if (!totalXp || totalXp <= 0) return 1;
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
};

/**
 * Determina a categoria competitiva (Rank Tier) baseada no nível do jogador.
 * 
 * @param {number} level
 * @returns {string}
 */
const determineRankTier = (level) => {
  if (level >= 50) return 'HOKAGE';
  if (level >= 35) return 'JONIN';
  if (level >= 20) return 'CHUNIN';
  if (level >= 10) return 'GENIN';
  return 'ESTUDANTE_ACADEMIA';
};

/**
 * Serviço de Negócio do Ciclo de Jogo Individual (Treino e Ranqueado).
 * Implementa validação anti-cheat de respostas e cronómetro autoritativo no servidor.
 */
export const quizService = {
  /**
   * Inicializa uma sessão de quiz individual para o jogador.
   * Selecciona perguntas aleatórias e omite a coluna `is_correct` do cliente.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {'TREINO' | 'RANQUEADO'} data.mode
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} data.difficulty
   * @param {number|null} [data.categoryId=null]
   * @param {number} [data.totalQuestions=10]
   * @returns {Promise<Object>} Dados da sessão inicializada e perguntas sanitizadas
   */
  startSession: async ({
    userId,
    mode,
    difficulty,
    categoryId = null,
    totalQuestions = 10,
  }) => {
    // 1. Busca perguntas elegíveis com gabarito oculto
    const questions = await quizRepository.findRandomQuestions({
      difficulty,
      categoryId,
      limit: totalQuestions,
    });

    if (!questions || questions.length === 0) {
      throw new AppError(
        'Não existem perguntas suficientes disponíveis no catálogo para os critérios seleccionados.',
        400,
        'NO_QUESTIONS_AVAILABLE'
      );
    }

    // 2. Cria a sessão persistida no banco Neon
    const session = await quizRepository.createSession({
      userId,
      mode,
      difficulty,
      categoryId,
      totalQuestions: questions.length,
    });

    logger.info(
      `Sessão de Quiz criada: ID=${session.id} | Modo=${mode} | Dificuldade=${difficulty} | Jogador=${userId}`
    );

    return {
      sessionId: session.id,
      mode: session.mode,
      difficulty: session.difficulty,
      totalQuestions: session.total_questions,
      questions: questions.map((q, index) => ({
        index: index + 1,
        id: q.id,
        text: q.question_text,
        imageUrl: q.image_url,
        timeLimitSeconds: q.time_limit_seconds,
        categoryName: q.category_name,
        animeTitle: q.anime_title,
        options: q.options || [],
      })),
    };
  },

  /**
   * Avalia a resposta enviada pelo jogador com verificação anti-cheat de cronómetro e gabarito.
   * 
   * @param {Object} data
   * @param {string} data.userId - UUID
   * @param {string} data.sessionId - UUID
   * @param {number} data.questionId
   * @param {number|null} [data.answerId=null]
   * @param {number} data.clientTimeMs - Tempo medido no cliente
   * @returns {Promise<Object>} Avaliação da resposta e gabarito revelado pós-resposta
   */
  submitAnswer: async ({
    userId,
    sessionId,
    questionId,
    answerId = null,
    clientTimeMs,
  }) => {
    // 1. Valida a existência e integridade da sessão
    const session = await quizRepository.findSessionById(sessionId);
    if (!session) {
      throw new AppError('Sessão de quiz não encontrada.', 404, 'SESSION_NOT_FOUND');
    }

    if (session.user_id !== userId) {
      throw new AppError('Acesso não autorizado a esta sessão de jogo.', 403, 'UNAUTHORIZED_SESSION');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new AppError('Esta sessão de quiz já foi finalizada.', 400, 'SESSION_ALREADY_FINISHED');
    }

    // 2. Busca a questão com gabarito oficial para validação segura no servidor
    const question = await quizRepository.findQuestionWithAnswers(questionId);
    if (!question) {
      throw new AppError('Pergunta não encontrada no catálogo.', 404, 'QUESTION_NOT_FOUND');
    }

    // 3. Validação Anti-Cheat de Cronómetro:
    // Tolerância máxima de 2500ms além do limite oficial para compensar latência de rede em Angola
    const maxAllowedTimeMs = (question.time_limit_seconds * 1000) + 2500;
    const isTimeout = clientTimeMs > maxAllowedTimeMs;

    // 4. Verificação de Correcção
    let isCorrect = false;
    if (!isTimeout && answerId) {
      isCorrect = await quizRepository.verifyAnswer(questionId, answerId);
    }

    // 5. Cálculo de Pontuação e XP com Bonificação de Velocidade
    let pointsAwarded = 0;
    let xpAwarded = 0;

    if (isCorrect) {
      const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[session.difficulty] || 1.0;
      const basePoints = question.base_points || 100;
      const baseXp = question.base_xp || 25;

      // Bonificação por agilidade: responder em menos de 50% do tempo concede até 25% de bónus
      const timeRatio = Math.max(0, Math.min(1, clientTimeMs / (question.time_limit_seconds * 1000)));
      const speedMultiplier = timeRatio <= 0.5 ? 1.25 : 1.0;

      pointsAwarded = Math.round(basePoints * difficultyMultiplier * speedMultiplier);
      xpAwarded = Math.round(baseXp * difficultyMultiplier);
    }

    // 6. Registo da resposta da questão
    await quizRepository.recordSessionAnswer({
      sessionId,
      questionId,
      selectedAnswerId: answerId,
      isCorrect,
      responseTimeMs: clientTimeMs,
      pointsAwarded,
      xpAwarded,
    });

    // 7. Avança índice da questão
    const newIndex = await quizRepository.incrementSessionQuestionIndex(sessionId);
    const isFinished = newIndex >= session.total_questions;

    // Se completou todas as perguntas, consolida os resultados automaticamente
    let finalResult = null;
    if (isFinished) {
      finalResult = await quizService.completeSession(sessionId, userId);
    }

    // Localiza a alternativa correcta para feedback educacional ao jogador pós-submissão
    const correctAnswer = question.answers?.find((a) => a.isCorrect === true);

    return {
      isCorrect,
      isTimeout,
      pointsAwarded,
      xpAwarded,
      correctAnswerId: correctAnswer?.id || null,
      explanation: question.explanation || '',
      isFinished,
      finalResult,
    };
  },

  /**
   * Consolida os resultados finais da sessão de quiz e actualiza a progressão do perfil.
   * 
   * @param {string} sessionId - UUID
   * @param {string} userId - UUID
   * @returns {Promise<Object>}
   */
  completeSession: async (sessionId, userId) => {
    return await withTransaction(async (client) => {
      const session = await quizRepository.findSessionById(sessionId, client);
      if (!session) {
        throw new AppError('Sessão de quiz não encontrada.', 404, 'SESSION_NOT_FOUND');
      }

      // Consulta todas as respostas dadas nesta sessão
      const { rows: answers } = await client.query(
        `SELECT * FROM quiz_session_answers WHERE session_id = $1;`,
        [sessionId]
      );

      const totalAnswered = answers.length;
      const correctAnswers = answers.filter((a) => a.is_correct).length;
      const incorrectAnswers = answers.filter((a) => !a.is_correct && a.selected_answer_id !== null).length;
      const unanswered = Math.max(0, session.total_questions - totalAnswered);

      const totalScore = answers.reduce((sum, a) => sum + (a.points_awarded || 0), 0);
      const totalXp = answers.reduce((sum, a) => sum + (a.xp_awarded || 0), 0);
      const timeSpentSeconds = Math.round(
        answers.reduce((sum, a) => sum + (a.response_time_ms || 0), 0) / 1000
      );

      const accuracyPercentage =
        session.total_questions > 0
          ? Math.round((correctAnswers / session.total_questions) * 10000) / 100
          : 0.00;

      // Actualiza estado da sessão para COMPLETED
      await quizRepository.completeSession(sessionId, 'COMPLETED', client);

      // Persiste o resultado consolidado
      const result = await quizRepository.createQuizResult(
        {
          sessionId,
          userId,
          correctAnswers,
          incorrectAnswers,
          unanswered,
          accuracyPercentage,
          totalScore,
          totalXp,
          timeSpentSeconds,
        },
        client
      );

      // Se for modo RANQUEADO, credita XP e pontos ao perfil e avalia subida de nível
      if (session.mode === 'RANQUEADO') {
        const isWin = accuracyPercentage >= 60; // Considera vitória individual se acertar >= 60%
        const profile = await profileRepository.findByUserId(userId, client);

        if (profile) {
          const newTotalXp = parseInt(profile.xp, 10) + totalXp;
          const newLevel = calculatePlayerLevel(newTotalXp);
          const newRankTier = determineRankTier(newLevel);

          await profileRepository.recordMatchResult(
            userId,
            {
              isWin,
              xpToAdd: totalXp,
              scoreToAdd: totalScore,
              newLevel,
              newRankTier,
            },
            client
          );

          logger.info(
            `Progresso creditado: Jogador=${userId} | XP Ganho=+${totalXp} | Pontos=+${totalScore} | Nível=${newLevel} (${newRankTier})`
          );
        }
      }

      return result;
    });
  },

  /**
   * Obtém o ecrã consolidado de resultado de uma partida finalizada.
   * 
   * @param {string} sessionId - UUID
   * @param {string} userId - UUID
   * @returns {Promise<Object>}
   */
  getResult: async (sessionId, userId) => {
    const result = await quizRepository.findResultBySessionId(sessionId);
    if (!result) {
      throw new AppError('Resultado da partida não encontrado.', 404, 'RESULT_NOT_FOUND');
    }

    if (result.user_id !== userId) {
      throw new AppError('Acesso não autorizado a este resultado.', 403, 'UNAUTHORIZED_RESULT');
    }

    return result;
  },
};

export default quizService;