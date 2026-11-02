import { tournamentService } from '../services/tournament.service.js';
import { tournamentRepository } from '../repositories/tournament.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { paymentService } from '../services/payment.service.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para Torneios Oficiais, Inscrições e Chaves Eliminatórias (Brackets).
 */
export const tournamentController = {
  /**
   * Renderiza a listagem de torneios abertos, em andamento e finalizados com filtros.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderList: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const status = req.query.status || null;
      const difficulty = req.query.difficulty || null;
      const isPaid =
        req.query.isPaid === 'true' ? true : req.query.isPaid === 'false' ? false : null;

      const [tournamentsResult, categories] = await Promise.all([
        tournamentRepository.findPaginated({
          page,
          limit: 12,
          status,
          difficulty,
          isPaid,
        }),
        animeRepository.findAllCategories(true),
      ]);

      res.render('pages/tournaments/list', {
        title: 'Torneios Competitivos de Anime — Anime Quiz',
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        tournaments: tournamentsResult.tournaments,
        totalTournaments: tournamentsResult.total,
        totalPages: tournamentsResult.totalPages,
        currentPage: page,
        categories,
        selectedStatus: status,
        selectedDifficulty: difficulty,
        selectedIsPaid: isPaid,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza os detalhes de um torneio específico, regras, premiação e estado da inscrição do jogador.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderDetails: async (req, res, next) => {
    try {
      const { slugOrId } = req.params;

      // Localiza por UUID ou por Slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      const tournament = isUuid
        ? await tournamentRepository.findById(slugOrId)
        : await tournamentRepository.findBySlug(slugOrId);

      if (!tournament) {
        throw new AppError('Torneio não encontrado.', 404, 'TOURNAMENT_NOT_FOUND');
      }

      // Verifica se o jogador autenticado já possui inscrição e respectivo estado
      let userRegistration = null;
      if (req.user) {
        userRegistration = await tournamentRepository.findRegistration(tournament.id, req.user.id);
      }

      // Carrega a chave eliminatória (Rounds & Matches) caso já tenha sido gerada
      let rounds = [];
      if (['IN_PROGRESS', 'COMPLETED'].includes(tournament.status)) {
        rounds = await tournamentRepository.findRoundsWithMatches(tournament.id);
      }

      res.render('pages/tournaments/details', {
        title: `${tournament.title} — Anime Quiz`,
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        tournament,
        userRegistration,
        rounds,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa o pedido de inscrição do jogador no torneio.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleRegister: async (req, res, next) => {
    try {
      const { tournamentId, paymentMethod } = req.body;

      const result = await tournamentService.registerUser({
        tournamentId,
        userId: req.user.id,
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      // Se for torneio pago, redireciona para a página de instrução de pagamento
      if (result.isPaid) {
        if (isApiRequest) {
          return res.status(200).json({
            success: true,
            isPaid: true,
            redirect: `/tournaments/${tournamentId}/payment`,
            payment: result.payment,
          });
        }
        return res.redirect(`/tournaments/${tournamentId}/payment`);
      }

      // Se for gratuito, inscrição confirmada
      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          isPaid: false,
          redirect: `/tournaments/${tournamentId}`,
          registration: result.registration,
        });
      }

      req.session.flash = { success: 'Inscrição confirmada com sucesso! Boa sorte na arena!' };
      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect(`/tournaments/${tournamentId}`);
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de instrução de pagamento para torneios com taxa de inscrição em AOA.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderPayment: async (req, res, next) => {
    try {
      const { id: tournamentId } = req.params;

      const tournament = await tournamentRepository.findById(tournamentId);
      if (!tournament) {
        throw new AppError('Torneio não encontrado.', 404, 'TOURNAMENT_NOT_FOUND');
      }

      const registration = await tournamentRepository.findRegistration(tournamentId, req.user.id);
      if (!registration) {
        throw new AppError('Inscrição não localizada para este torneio.', 404, 'REGISTRATION_NOT_FOUND');
      }

      // Localiza a cobrança pendente gerada na inscrição
      const { rows: payments } = await paymentRepository.findAllPaginated({
        page: 1,
        limit: 1,
        search: req.user.username,
      });

      const payment = payments.find(
        (p) => p.tournament_id === tournamentId && p.user_id === req.user.id
      );

      const bankDetails = paymentService.getOfficialBankDetails();

      res.render('pages/tournaments/payment', {
        title: `Pagamento da Inscrição: ${tournament.title} — Anime Quiz`,
        layout: 'layouts/dashboard',
        tournament,
        registration,
        payment,
        bankDetails,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a visualização isolada das chaves eliminatórias (Brackets) do torneio.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderBracket: async (req, res, next) => {
    try {
      const { id: tournamentId } = req.params;

      const tournament = await tournamentRepository.findById(tournamentId);
      if (!tournament) {
        throw new AppError('Torneio não encontrado.', 404, 'TOURNAMENT_NOT_FOUND');
      }

      const rounds = await tournamentRepository.findRoundsWithMatches(tournamentId);

      res.render('pages/tournaments/bracket', {
        title: `Chave Eliminatória: ${tournament.title} — Anime Quiz`,
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        tournament,
        rounds,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default tournamentController;