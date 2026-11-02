import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireModerator } from '../middlewares/role.middleware.js';
import { uploadLimiter } from '../middlewares/rate-limit.middleware.js';
import { handlePaymentProofUpload } from '../middlewares/upload.middleware.js';
import { csrfProtectionMiddleware } from '../config/security.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import { reviewPaymentProofSchema } from '../validators/payment.validator.js';

const router = Router();

// =============================================================================
// SUBMISSÃO DE COMPROVATIVOS BANCÁRIOS (ANGOLA - AOA)
// =============================================================================

/**
 * Rota para upload de ficheiros de comprovativo (PDF ou Imagem).
 * Protegida por rate limiting de upload e multipart parser com nome UUIDv4.
 */
router.post(
  '/proof',
  requireAuth,
  uploadLimiter,
  handlePaymentProofUpload('proof'),
  paymentController.handleSubmitProof
);

// =============================================================================
// ACESSO PROTEGIDO A DOCUMENTOS FINANCEIROS
// =============================================================================

/**
 * Rota para streaming seguro do ficheiro de comprovativo bancário.
 * Acesso restrito ao próprio titular do pagamento ou membros da equipa de moderação.
 */
router.get(
  '/proof/:proofId',
  requireAuth,
  paymentController.streamProofDocument
);

// =============================================================================
// MODERAÇÃO ADMINISTRATIVA DE PAGAMENTOS
// =============================================================================

/**
 * Rota para aprovação ou rejeição de comprovativo bancário e libertação de vaga no torneio.
 * Acesso restrito a Moderadores e Administradores (RBAC).
 */
router.post(
  '/review',
  requireAuth,
  requireModerator,
  csrfProtectionMiddleware,
  validateBody(reviewPaymentProofSchema, true),
  paymentController.handleReviewProof
);

export default router;