import { authService } from '../services/auth.service.js';
import { env } from '../config/environment.js';
import { logger } from '../utils/logger.util.js';

/**
 * Controlador HTTP para os fluxos de Autenticação, Registo, Sessões e Recuperação de Acesso.
 * Suporta tanto respostas renderizadas via EJS como payloads JSON para requisições assíncronas (Fetch API).
 */
export const authController = {
  /**
   * Renderiza a página de login.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderLogin: (req, res) => {
    res.render('pages/auth/login', {
      title: 'Iniciar Sessão — Anime Quiz',
      layout: 'layouts/auth',
    });
  },

  /**
   * Processa a submissão do formulário de autenticação.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleLogin: async (req, res, next) => {
    try {
      const { login, password, rememberMe } = req.body;

      const userSessionData = await authService.login({
        login,
        password,
        ipAddress: req.ip,
      });

      // Grava o utilizador autenticado na sessão persistente no PostgreSQL Neon
      req.session.user = userSessionData;

      // Se "Lembrar-me" for seleccionado, estende a duração do cookie para 30 dias
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      }

      const returnUrl = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message: 'Autenticação realizada com sucesso.',
          redirect: returnUrl,
          user: userSessionData,
        });
      }

      req.session.flash = {
        success: `Bem-vindo de volta ao ecossistema, ${userSessionData.displayName}!`,
      };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect(returnUrl);
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de registo de novos competidores.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderRegister: (req, res) => {
    res.render('pages/auth/register', {
      title: 'Criar Conta de Competidor — Anime Quiz',
      layout: 'layouts/auth',
    });
  },

  /**
   * Processa o registo de uma nova conta de jogador.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleRegister: async (req, res, next) => {
    try {
      const { username, displayName, email, password } = req.body;

      const newUser = await authService.register({
        username,
        displayName,
        email,
        password,
      });

      // Autentica automaticamente o utilizador após o cadastro bem-sucedido
      req.session.user = newUser;

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(201).json({
          success: true,
          message: 'Conta criada com sucesso.',
          redirect: '/dashboard',
          user: newUser,
        });
      }

      req.session.flash = {
        success: `A sua jornada começou, ${newUser.displayName}! Bem-vindo ao Anime Quiz.`,
      };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/dashboard');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Encerra a sessão activa, expurga o cookie e redireciona para o login.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleLogout: (req, res, next) => {
    const username = req.session?.user?.username || 'Anónimo';

    req.session.destroy((err) => {
      if (err) {
        logger.error(`Erro ao destruir sessão para ${username}:`, err.message);
        return next(err);
      }

      res.clearCookie('aq_session_id', { path: '/' });
      res.clearCookie('aq_csrf_token', { path: '/' });

      logger.info(`Sessão encerrada com sucesso para o utilizador: ${username}`);
      res.redirect('/auth/login');
    });
  },

  /**
   * Renderiza a página de solicitação de recuperação de senha.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderForgotPassword: (req, res) => {
    res.render('pages/auth/forgot-password', {
      title: 'Recuperar Palavra-passe — Anime Quiz',
      layout: 'layouts/auth',
    });
  },

  /**
   * Processa a solicitação de redefinição de palavra-passe.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleForgotPassword: async (req, res, next) => {
    try {
      const { email } = req.body;

      const result = await authService.requestPasswordReset(email);

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      const message =
        'Se o endereço informado estiver registado na plataforma, receberá as instruções para redefinição da palavra-passe.';

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message,
          ...(env.IS_DEVELOPMENT && result.token ? { devResetToken: result.token } : {}),
        });
      }

      req.session.flash = { info: message };

      // Em ambiente de desenvolvimento, preserva o link na sessão para facilitar testes
      if (env.IS_DEVELOPMENT && result.token) {
        req.session.flash.warning = `[DEV MODO] Link de redefinição: /auth/reset-password?token=${result.token}`;
      }

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/auth/forgot-password');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de definição de nova palavra-passe com token.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  renderResetPassword: (req, res) => {
    const token = req.query.token || '';

    res.render('pages/auth/reset-password', {
      title: 'Definir Nova Palavra-passe — Anime Quiz',
      layout: 'layouts/auth',
      token,
    });
  },

  /**
   * Conclui a redefinição de palavra-passe.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleResetPassword: async (req, res, next) => {
    try {
      const { token, password } = req.body;

      await authService.resetPassword(token, password);

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message: 'Palavra-passe redefinida com sucesso. Pode iniciar sessão.',
          redirect: '/auth/login',
        });
      }

      req.session.flash = {
        success: 'A sua palavra-passe foi actualizada com sucesso. Inicie sessão com as novas credenciais.',
      };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/auth/login');
      });
    } catch (error) {
      next(error);
    }
  },
};

export default authController;