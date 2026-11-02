import { paymentService } from '../services/payment.service.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Controlador HTTP para Submissão de Comprovativos Bancários,
 * Moderação Financeira em Angola (AOA) e Acesso Protegido a Documentos.
 */
export const paymentController = {
  /**
   * Processa a submissão do comprovativo bancário enviado pelo jogador (Upload Multipart).
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleSubmitProof: async (req, res, next) => {
    try {
      const { paymentId, payerName, payerAccountOrPhone, transferReference, transferDate } = req.body;
      const uploadedFile = req.file;

      if (!uploadedFile) {
        throw new AppError(
          'O ficheiro de comprovativo (PDF ou Imagem) é obrigatório.',
          400,
          'PROOF_FILE_REQUIRED'
        );
      }

      const proof = await paymentService.submitProof({
        paymentId,
        userId: req.user.id,
        uploadedFile,
        payerName,
        payerAccountOrPhone,
        transferReference,
        transferDate,
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(201).json({
          success: true,
          message: 'Comprovativo bancário submetido com sucesso. Aguarda análise dos moderadores.',
          proofId: proof.id,
        });
      }

      req.session.flash = {
        success: 'Comprovativo submetido com sucesso! A nossa equipa irá validar a transferência em breve.',
      };

      // Obtém o torneio associado para redirecionamento
      const payment = await paymentRepository.findById(paymentId);
      const redirectUrl = payment?.tournament_id ? `/tournaments/${payment.tournament_id}` : '/dashboard';

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect(redirectUrl);
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Moderação Administrativa de Comprovativos (Aprovação ou Rejeição de Inscrição em AOA).
   * Restrito a Administradores e Moderadores autorizados.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  handleReviewProof: async (req, res, next) => {
    try {
      const { proofId, action, rejectionReason, adminNotes } = req.body;

      const result = await paymentService.reviewProof({
        proofId,
        adminUserId: req.user.id,
        action,
        rejectionReason,
        adminNotes,
      });

      const isApiRequest =
        req.xhr ||
        req.path.startsWith('/api') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isApiRequest) {
        return res.status(200).json({
          success: true,
          message:
            action === 'APPROVE'
              ? 'Pagamento aprovado e inscrição confirmada no torneio.'
              : 'Comprovativo rejeitado com sucesso.',
          data: result,
        });
      }

      req.session.flash = {
        success:
          action === 'APPROVE'
            ? 'Pagamento aprovado com sucesso!'
            : 'Comprovativo rejeitado com a justificativa registada.',
      };

      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect('/admin/payments');
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Fornece streaming seguro do ficheiro de comprovativo (PDF ou Imagem).
   * O directório de comprovativos não é público; o ficheiro só é servido após
   * validação estrita de posse pelo próprio jogador ou privilégios da equipa de moderação.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  streamProofDocument: async (req, res, next) => {
    try {
      const { proofId } = req.params;

      const { filePath, mimeType, filename } = await paymentService.getSecureProofStreamData(
        proofId,
        req.user
      );

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

      return res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  },
};

export default paymentController;