import { AppError } from './error.middleware.js';

/**
 * Middleware de Controlo de Acesso Baseado em Funções (RBAC - Role-Based Access Control).
 * Valida se o utilizador autenticado possui pelo menos uma das funções (roles) permitidas.
 * 
 * @param {...string} allowedRoles - Lista de papéis autorizados (ex: 'ADMIN', 'MODERATOR')
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const isApiRequest =
      req.xhr ||
      req.path.startsWith('/api') ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    const user = req.user || req.session?.user;

    // 1. Verifica se existe sessão autenticada
    if (!user) {
      if (isApiRequest) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticação necessária para validar permissões de acesso.',
          },
        });
      }

      req.session.returnTo = req.originalUrl;
      if (!req.session.flash) req.session.flash = {};
      req.session.flash.warning = 'Inicie sessão com uma conta autorizada para continuar.';
      return res.redirect('/auth/login');
    }

    // 2. Extrai os papéis associados ao utilizador (suporta papel único ou lista de papéis)
    const userRoles = new Set();
    if (user.role) {
      userRoles.add(user.role.toUpperCase());
    }
    if (Array.isArray(user.roles)) {
      user.roles.forEach((r) => userRoles.add(String(r).toUpperCase()));
    }

    // Papel 'ADMIN' possui acesso universal a todos os recursos protegidos
    if (userRoles.has('ADMIN')) {
      return next();
    }

    // 3. Valida se o utilizador possui qualquer um dos papéis requeridos
    const hasPermission = allowedRoles.some((role) => userRoles.has(role.toUpperCase()));

    if (!hasPermission) {
      if (isApiRequest) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Acesso negado. A sua conta não possui privilégios suficientes para executar esta operação.',
          },
        });
      }

      return next(
        new AppError(
          'Acesso restrito. Não possui o nível de permissão necessário para aceder a este módulo administrativo.',
          403,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    next();
  };
};

/**
 * Atalho para rotas exclusivas de Administradores Master.
 */
export const requireAdmin = requireRole('ADMIN');

/**
 * Atalho para rotas de Moderação e Auditoria (Administradores e Moderadores).
 */
export const requireModerator = requireRole('ADMIN', 'MODERATOR');

/**
 * Validação granular de permissões específicas por acção (ex: 'approve_payments', 'manage_questions').
 * 
 * @param {...string} requiredPermissions - Códigos das permissões necessárias
 * @returns {import('express').RequestHandler}
 */
export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const isApiRequest =
      req.xhr ||
      req.path.startsWith('/api') ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    const user = req.user || req.session?.user;

    if (!user) {
      if (isApiRequest) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticação necessária.',
          },
        });
      }
      return res.redirect('/auth/login');
    }

    // Administrador tem bypass total
    if (user.role === 'ADMIN' || (Array.isArray(user.roles) && user.roles.includes('ADMIN'))) {
      return next();
    }

    const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      if (isApiRequest) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Permissão específica em falta para esta operação.',
          },
        });
      }

      return next(
        new AppError(
          'Operação não autorizada pelas políticas de segurança da plataforma.',
          403,
          'PERMISSION_DENIED'
        )
      );
    }

    next();
  };
};

export default {
  requireRole,
  requireAdmin,
  requireModerator,
  requirePermission,
};