import { quizService } from '../services/quiz.service.js';
import { scoringService } from '../services/scoring.service.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para o Motor de Quiz Individual (Treino e Ranqueado).
 * Gere a inicialização de sessões, a arena de jogo fullscreen e a exibição de resultados.
 */
export const quizController = {
  /**
   * Renderiza o lobby de selecção de modo (Treino vs Ranqueado), dificuldades e categorias.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderLobby: async (req, res, next) => {
    try {
      const categories = await animeRepository.findAllCategories(true);

      res.render('pages/quiz/lobby', {
        title: 'Arena de Quiz Individual — Anime Quiz',
        layout: 'layouts/dashboard',
        categories,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Inicia formalmente uma nova sessão de quiz individual.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleStartSession: async (req, res, next) => {
    try {
      const { mode, difficulty, categoryId, totalQuestions } = req.body;

      const sessionData = await quizService.startSession({
        userId: req.user.id,
        mode,
        difficulty,
        categoryId: categoryId ? parseInt(categoryId, 10) : null,
        totalQuestions: totalQuestions ? parseInt(totalQuestions, 10) : 10,
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(201).json({
          success: true,
          session: sessionData,
          redirect: `/quiz/play/${sessionData.sessionId}`,
        });
      }

      res.redirect(`/quiz/play/${sessionData.sessionId}`);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a interface de jogo da partida (HUD de Jogo sem distrações visuais).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderPlay: async (req, res, next) => {
    try {
      const { id: sessionId } = req.params;

      const session = await quizRepository.findSessionById(sessionId);
      if (!session) {
        throw new AppError('Sessão de jogo não encontrada.', 404, 'SESSION_NOT_FOUND');
      }

      if (session.user_id !== req.user.id) {
        throw new AppError('Não possui permissão para aceder a esta sessão.', 403, 'FORBIDDEN');
      }

      // Se a sessão já foi finalizada, encaminha directamente para os resultados
      if (session.status !== 'IN_PROGRESS') {
        return res.redirect(`/quiz/result/${sessionId}`);
      }

      // Carrega perguntas aleatórias com alternativas seguras (sem coluna is_correct)
      const questions = await quizRepository.findRandomQuestions({
        difficulty: session.difficulty,
        categoryId: session.category_id,
        limit: session.total_questions,
      });

      res.render('pages/quiz/play', {
        title: `Em Jogo [${session.difficulty}] — Anime Quiz`,
        layout: 'layouts/game',
        session,
        questionsJson: JSON.stringify(questions),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a submissão de resposta a uma questão com validação de cronómetro no servidor.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleSubmitAnswer: async (req, res, next) => {
    try {
      const { sessionId, questionId, answerId, clientTimeMs } = req.body;

      const evaluation = await quizService.submitAnswer({
        userId: req.user.id,
        sessionId,
        questionId: parseInt(questionId, 10),
        answerId: answerId ? parseInt(answerId, 10) : null,
        clientTimeMs: parseInt(clientTimeMs, 10) || 0,
      });

      res.status(200).json({
        success: true,
        data: evaluation,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza o ecrã consolidado de resultados da partida individual.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderResult: async (req, res, next) => {
    try {
      const { id: sessionId } = req.params;

      const result = await quizService.getResult(sessionId, req.user.id);
      const rating = scoringService.evaluateMatchRating(
        parseFloat(result.accuracy_percentage),
        result.time_spent_seconds,
        result.total_questions
      );

      res.render('pages/quiz/result', {
        title: `Resultado da Partida — Anime Quiz`,
        layout: 'layouts/dashboard',
        result,
        rating,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default quizController;