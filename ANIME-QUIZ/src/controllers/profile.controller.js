import { userService } from '../services/user.service.js';
import { scoringService } from '../services/scoring.service.js';
import { rankingService } from '../services/ranking.service.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para Perfil do Competidor, Histórico de Partidas e Personalização.
 */
export const profileController = {
  /**
   * Renderiza a página de perfil do próprio jogador autenticado.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderProfile: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const [profile, achievements, medals, rankCard] = await Promise.all([
        userService.getProfile(userId),
        userService.getAchievements(userId),
        userService.getMedals(userId),
        rankingService.getUserRankCard(userId, { period: 'GLOBAL' }),
      ]);

      const levelProgress = scoringService.calculateLevelProgress(profile.xp);

      res.render('pages/profile/view', {
        title: `Perfil de ${profile.displayName} — Anime Quiz`,
        layout: 'layouts/dashboard',
        profile,
        levelProgress,
        achievements,
        medals,
        rankCard,
        isOwnProfile: true,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza o perfil público de outro jogador através do seu username.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderPublicProfile: async (req, res, next) => {
    try {
      const { username } = req.params;

      const profile = await userService.getPublicProfile(username);
      const levelProgress = scoringService.calculateLevelProgress(profile.xp);
      const isOwnProfile = req.user && req.user.id === profile.userId;

      res.render('pages/profile/view', {
        title: `Perfil de ${profile.displayName} (@${profile.username}) — Anime Quiz`,
        layout: req.isAuthenticated ? 'layouts/dashboard' : 'layouts/main',
        profile,
        levelProgress,
        achievements: profile.achievements,
        medals: profile.medals,
        isOwnProfile,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza o formulário de edição de dados de perfil.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderEditProfile: async (req, res, next) => {
    try {
      const profile = await userService.getProfile(req.user.id);

      res.render('pages/profile/edit', {
        title: 'Editar Perfil — Anime Quiz',
        layout: 'layouts/dashboard',
        profile,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a actualização dos dados cadastrais (nome de exibição, bio, contacto).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleUpdateProfile: async (req, res, next) => {
    try {
      const { displayName, bio, countryCode, phoneNumber } = req.body;

      const updatedProfile = await userService.updateProfile(req.user.id, {
        displayName,
        bio,
        countryCode,
        phoneNumber,
      });

      // Actualiza os dados na sessão activa para manter navbar e layouts sincronizados
      if (req.session.user) {
        req.session.user.displayName = updatedProfile.display_name;
      }

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message: 'Perfil actualizado com sucesso.',
          profile: updatedProfile,
        });
      }

      req.session.flash = { success: 'Perfil actualizado com sucesso!' };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/profile');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a alteração de avatar (via upload Multer ou selecção de galeria oficial).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleUpdateAvatar: async (req, res, next) => {
    try {
      const uploadedFile = req.file || null;
      const avatarUrl = req.body.avatarUrl || null;

      const newAvatarUrl = await userService.updateAvatar(req.user.id, {
        avatarUrl,
        uploadedFile,
      });

      if (req.session.user) {
        req.session.user.avatarUrl = newAvatarUrl;
      }

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message: 'Avatar modificado com sucesso.',
          avatarUrl: newAvatarUrl,
        });
      }

      req.session.flash = { success: 'Avatar actualizado com sucesso!' };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/profile/edit');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de histórico paginado de partidas individuais e multiplayer.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  renderMatchHistory: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const mode = req.query.mode || null;

      const { history, total, totalPages } = await userService.getMatchHistory(req.user.id, {
        page,
        limit: 10,
        mode,
      });

      res.render('pages/profile/match-history', {
        title: 'Histórico de Partidas — Anime Quiz',
        layout: 'layouts/dashboard',
        history,
        currentPage: page,
        totalPages,
        totalMatches: total,
        selectedMode: mode,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default profileController;