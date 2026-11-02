import { auditService } from '../services/audit.service.js';
import { tournamentService } from '../services/tournament.service.js';
import { tournamentRepository } from '../repositories/tournament.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { paymentService } from '../services/payment.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { withTransaction } from '../database/connection.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP do Painel Administrativo Master (Staff & Moderação).
 * Centraliza métricas executivas, moderação de pagamentos AOA, catálogo de perguntas e governança.
 */
export const adminController = {
  // ===========================================================================
  // MÓDULO: VISÃO GERAL (DASHBOARD EXECUTIVO)
  // ===========================================================================

  /**
   * Renderiza a visão geral do painel administrativo com KPIs consolidados.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderDashboard: async (req, res, next) => {
    try {
      const [kpis, recentAuditLogs, pendingPaymentsResult] = await Promise.all([
        auditService.getAdminDashboardSummary(),
        auditService.getAuditLogs({ page: 1, limit: 6 }),
        paymentRepository.findAllPaginated({
          page: 1,
          limit: 5,
          status: 'PROOF_SUBMITTED',
        }),
      ]);

      res.render('pages/admin/dashboard', {
        title: 'Painel Administrativo — Anime Quiz',
        layout: 'layouts/admin',
        kpis,
        recentAuditLogs: recentAuditLogs.logs,
        pendingPayments: pendingPaymentsResult.payments,
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================================
  // MÓDULO: GESTÃO DE UTILIZADORES E PRIVILÉGIOS (RBAC)
  // ===========================================================================

  /**
   * Renderiza a listagem paginada de utilizadores com filtros de pesquisa.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderUsers: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const search = req.query.search ? String(req.query.search).trim() : '';

      const { users, total, totalPages } = await userRepository.findPaginated({
        page,
        limit: 15,
        search,
      });

      res.render('pages/admin/users', {
        title: 'Gestão de Utilizadores — Painel Staff',
        layout: 'layouts/admin',
        users,
        totalUsers: total,
        totalPages,
        currentPage: page,
        search,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Actualiza o estado de activação de uma conta (Suspensão ou Reativação).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleUpdateUserStatus: async (req, res, next) => {
    try {
      const { userId, isActive, reason } = req.body;

      if (userId === req.user.id) {
        throw new AppError('Não é permitido suspender a sua própria conta de administrador.', 400, 'SELF_SUSPENSION_PROHIBITED');
      }

      await userRepository.updateStatus(userId, Boolean(isActive));

      await auditService.logAction({
        adminUserId: req.user.id,
        action: isActive ? 'ACTIVATE_USER' : 'SUSPEND_USER',
        targetEntity: 'users',
        targetId: userId,
        notes: reason || 'Alteração manual de estado de conta via painel staff.',
      });

      res.status(200).json({
        success: true,
        message: isActive ? 'Conta de utilizador reactivada.' : 'Conta de utilizador suspensa.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Atribui uma nova função (Role) ao utilizador.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleAssignRole: async (req, res, next) => {
    try {
      const { userId, roleName } = req.body;

      await userRepository.assignRole(userId, roleName);

      await auditService.logAction({
        adminUserId: req.user.id,
        action: 'ASSIGN_ROLE',
        targetEntity: 'user_roles',
        targetId: userId,
        notes: `Papel concedido: ${roleName}`,
      });

      res.status(200).json({
        success: true,
        message: `Papel "${roleName}" atribuído com sucesso.`,
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================================
  // MÓDULO: MODERAÇÃO DE PAGAMENTOS E COMPROVATIVOS (AOA)
  // ===========================================================================

  /**
   * Renderiza a fila de pagamentos e comprovativos bancários pendentes de revisão.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderPayments: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const status = req.query.status || 'PROOF_SUBMITTED';
      const search = req.query.search ? String(req.query.search).trim() : '';

      const { payments, total, totalPages } = await paymentRepository.findAllPaginated({
        page,
        limit: 15,
        status: status === 'ALL' ? null : status,
        search,
      });

      res.render('pages/admin/payments', {
        title: 'Moderação de Pagamentos (AOA) — Painel Staff',
        layout: 'layouts/admin',
        payments,
        totalPayments: total,
        totalPages,
        currentPage: page,
        selectedStatus: status,
        search,
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================================
  // MÓDULO: GESTÃO DE TORNEIOS
  // ===========================================================================

  /**
   * Renderiza a listagem de torneios para gestão administrativa.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderTournaments: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;

      const { tournaments, total, totalPages } = await tournamentRepository.findPaginated({
        page,
        limit: 15,
      });

      const categories = await animeRepository.findAllCategories(true);

      res.render('pages/admin/tournaments', {
        title: 'Gestão de Torneios — Painel Staff',
        layout: 'layouts/admin',
        tournaments,
        totalTournaments: total,
        totalPages,
        currentPage: page,
        categories,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a criação de um torneio através do painel de administração.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleCreateTournament: async (req, res, next) => {
    try {
      const tournament = await tournamentService.createTournament({
        ...req.body,
        createdBy: req.user.id,
      });

      await auditService.logAction({
        adminUserId: req.user.id,
        action: 'CREATE_TOURNAMENT',
        targetEntity: 'tournaments',
        targetId: tournament.id,
        newData: { title: tournament.title, maxParticipants: tournament.max_participants },
      });

      req.session.flash = { success: `Torneio "${tournament.title}" criado com sucesso!` };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/admin/tournaments');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Dispara a geração das chaves eliminatórias (Brackets) e inicia o torneio.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleGenerateBrackets: async (req, res, next) => {
    try {
      const { tournamentId } = req.body;

      const rounds = await tournamentService.generateBrackets(tournamentId);

      await auditService.logAction({
        adminUserId: req.user.id,
        action: 'GENERATE_BRACKETS',
        targetEntity: 'tournaments',
        targetId: tournamentId,
        notes: `Chaves geradas com ${rounds.length} rondas eliminatórias.`,
      });

      res.status(200).json({
        success: true,
        message: 'Chaves eliminatórias geradas com sucesso. Torneio em andamento!',
        rounds,
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================================
  // MÓDULO: BANCO DE PERGUNTAS E RESPOSTAS DO QUIZ
  // ===========================================================================

  /**
   * Renderiza o catálogo de perguntas com filtros e formulário de adição.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderQuestions: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const difficulty = req.query.difficulty || null;
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;
      const search = req.query.search ? String(req.query.search).trim() : '';

      const [questionsResult, categories, animesResult] = await Promise.all([
        quizRepository.findQuestionsPaginated({
          page,
          limit: 15,
          difficulty,
          categoryId,
          search,
        }),
        animeRepository.findAllCategories(true),
        animeRepository.findPaginated({ page: 1, limit: 100, onlyActive: true }),
      ]);

      res.render('pages/admin/questions', {
        title: 'Banco de Perguntas — Painel Staff',
        layout: 'layouts/admin',
        questions: questionsResult.questions,
        totalQuestions: questionsResult.total,
        totalPages: questionsResult.totalPages,
        currentPage: page,
        categories,
        animes: animesResult.animes,
        selectedDifficulty: difficulty,
        selectedCategory: categoryId,
        search,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cria uma nova questão no catálogo com validação atómica das 4 alternativas.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleCreateQuestion: async (req, res, next) => {
    try {
      const {
        categoryId,
        animeId,
        questionText,
        imageUrl,
        difficulty,
        explanation,
        timeLimitSeconds,
        basePoints,
        baseXp,
        answers,
      } = req.body;

      const createdQuestion = await withTransaction(async (client) => {
        return await quizRepository.createQuestionWithAnswers(
          {
            categoryId: parseInt(categoryId, 10),
            animeId: animeId ? parseInt(animeId, 10) : null,
            questionText,
            imageUrl,
            difficulty,
            explanation,
            timeLimitSeconds: parseInt(timeLimitSeconds, 10) || 15,
            basePoints: parseInt(basePoints, 10) || 100,
            baseXp: parseInt(baseXp, 10) || 25,
            createdBy: req.user.id,
          },
          answers,
          client
        );
      });

      await auditService.logAction({
        adminUserId: req.user.id,
        action: 'CREATE_QUESTION',
        targetEntity: 'quiz_questions',
        targetId: String(createdQuestion.id),
        newData: { questionText, difficulty, categoryId },
      });

      req.session.flash = { success: 'Pergunta adicionada com sucesso ao catálogo!' };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/admin/questions');
      });
    } catch (error) {
      next(error);
    }
  },

  // ===========================================================================
  // MÓDULO: AUDITORIA E DENÚNCIAS
  // ===========================================================================

  /**
   * Renderiza a listagem de denúncias da comunidade.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderReports: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const status = req.query.status || null;

      const { reports, total, totalPages } = await auditService.getReports({
        page,
        limit: 15,
        status,
      });

      res.render('pages/admin/reports', {
        title: 'Moderação de Denúncias — Painel Staff',
        layout: 'layouts/admin',
        reports,
        totalReports: total,
        totalPages,
        currentPage: page,
        selectedStatus: status,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Conclui a análise de uma denúncia.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleResolveReport: async (req, res, next) => {
    try {
      const { reportId, status, resolutionNotes } = req.body;

      await auditService.resolveReport({
        reportId,
        status,
        resolutionNotes,
        adminUserId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: 'Denúncia moderada com sucesso.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza o histórico de auditoria forense das operações administrativas.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderAuditLogs: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const action = req.query.action || null;
      const targetEntity = req.query.targetEntity || null;

      const { logs, total, totalPages } = await auditService.getAuditLogs({
        page,
        limit: 25,
        action,
        targetEntity,
      });

      res.render('pages/admin/audit-logs', {
        title: 'Registos de Auditoria — Painel Staff',
        layout: 'layouts/admin',
        logs,
        totalLogs: total,
        totalPages,
        currentPage: page,
        selectedAction: action,
        selectedEntity: targetEntity,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default adminController;