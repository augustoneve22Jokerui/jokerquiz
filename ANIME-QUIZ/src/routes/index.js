import { Router } from 'express';
import { homeController } from '../controllers/home.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';

import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import profileRoutes from './profile.routes.js';
import quizRoutes from './quiz.routes.js';
import roomRoutes from './room.routes.js';
import tournamentRoutes from './tournament.routes.js';
import paymentRoutes from './payment.routes.js';
import rankingRoutes from './ranking.routes.js';
import chatRoutes from './chat.routes.js';
import animeRoutes from './anime.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

// =============================================================================
// ROTAS PÚBLICAS GERAIS (LANDING PAGE & INSTITUCIONAL)
// =============================================================================

router.get('/', optionalAuth, homeController.renderHome);
router.get('/about', optionalAuth, homeController.renderAbout);
router.get('/rules', optionalAuth, homeController.renderRules);
router.get('/catalog', optionalAuth, homeController.renderAnimes);

// =============================================================================
// SUB-ROTEADORES MODULARES DO ECOSSISTEMA
// =============================================================================

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/profile', profileRoutes);
router.use('/quiz', quizRoutes);
router.use('/rooms', roomRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/payments', paymentRoutes);
router.use('/rankings', rankingRoutes);
router.use('/chat', chatRoutes);
router.use('/animes', animeRoutes);
router.use('/admin', adminRoutes);

export default router;