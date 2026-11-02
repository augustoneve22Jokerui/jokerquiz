import { withTransaction } from '../database/connection.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { tournamentRepository } from '../repositories/tournament.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import {
  calculateFileSha256,
  deleteFileIfExists,
  getSafeFilePath,
} from '../utils/file-storage.util.js';
import { env } from '../config/environment.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio para Gestão de Pagamentos em Angola (AOA),
 * Processamento de Comprovativos Bancários, Auditoria Anti-Fraude e Moderação Humana.
 */
export const paymentService = {
  /**
   * Retorna os dados bancários oficiais da plataforma para realização de transferências e Multicaixa Express.
   * 
   * @returns {Object}
   */
  getOfficialBankDetails: () => {
    return {
      bankName: env.BANK.name,
      accountName: env.BANK.accountName,
      iban: env.BANK.iban,
      accountNumber: env.BANK.accountNumber,
      multicaixaPhone: env.BANK.multicaixaPhone,
      currency: env.BANK.currency,
    };
  },

  /**
   * Obtém os detalhes de uma cobrança com dados bancários oficiais acoplados.
   * 
   * @param {string} paymentId - UUID
   * @param {string} userId - UUID do solicitante
   * @returns {Promise<Object>}
   */
  getPaymentDetails: async (paymentId, userId) => {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) {
      throw new AppError('Registo de pagamento não encontrado.', 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.user_id !== userId) {
      throw new AppError('Acesso não autorizado a esta cobrança.', 403, 'UNAUTHORIZED_PAYMENT');
    }

    return {
      payment,
      bankDetails: paymentService.getOfficialBankDetails(),
    };
  },

  /**
   * Submete o comprovativo bancário enviado pelo jogador:
   * 1. Calcula o hash SHA-256 do ficheiro físico;
   * 2. Valida contra fraudes de comprovativos duplicados no sistema;
   * 3. Regista os metadados em `payment_proofs`;
   * 4. Transiciona a cobrança e a inscrição para 'PROOF_SUBMITTED'.
   * 
   * @param {Object} data
   * @param {string} data.paymentId - UUID
   * @param {string} data.userId - UUID
   * @param {Express.Multer.File} data.uploadedFile
   * @param {string} data.payerName
   * @param {string} [data.payerAccountOrPhone]
   * @param {string} [data.transferReference]
   * @param {string} [data.transferDate]
   * @returns {Promise<Object>} Comprovativo registado
   */
  submitProof: async ({
    paymentId,
    userId,
    uploadedFile,
    payerName,
    payerAccountOrPhone = null,
    transferReference = null,
    transferDate = null,
  }) => {
    if (!uploadedFile) {
      throw new AppError('O ficheiro do comprovativo bancário é obrigatório.', 400, 'FILE_REQUIRED');
    }

    return await withTransaction(async (client) => {
      // 1. Bloqueia a cobrança para validação
      const payment = await paymentRepository.findByIdWithLock(paymentId, client);
      if (!payment) {
        await deleteFileIfExists(uploadedFile.path);
        throw new AppError('Pagamento não localizado.', 404, 'PAYMENT_NOT_FOUND');
      }

      if (payment.user_id !== userId) {
        await deleteFileIfExists(uploadedFile.path);
        throw new AppError('Não possui autorização para anexar ficheiros a este pagamento.', 403, 'UNAUTHORIZED');
      }

      if (payment.status === 'APPROVED') {
        await deleteFileIfExists(uploadedFile.path);
        throw new AppError('Este pagamento já foi aprovado anteriormente.', 400, 'PAYMENT_ALREADY_APPROVED');
      }

      // 2. Análise Criptográfica Anti-Fraude (Hash SHA-256)
      const fileSha256 = await calculateFileSha256(uploadedFile.path);
      const existingProof = await paymentRepository.findBySha256(fileSha256, client);

      if (existingProof) {
        await deleteFileIfExists(uploadedFile.path);
        logger.warn(
          `[ANTI-FRAUD DETECTED] Tentativa de submissão de comprovativo duplicado! Hash=${fileSha256} | User=${userId}`
        );
        throw new AppError(
          'Este documento de comprovativo já foi submetido anteriormente no sistema. Envie o comprovativo autêntico da operação.',
          400,
          'DUPLICATE_PROOF_FILE'
        );
      }

      // 3. Regista o comprovativo na base de dados
      const proof = await paymentRepository.createProof(
        {
          paymentId,
          userId,
          filePath: uploadedFile.path,
          originalFilename: uploadedFile.originalname,
          fileSizeBytes: uploadedFile.size,
          mimeType: uploadedFile.mimetype,
          fileSha256,
          payerName,
          payerAccountOrPhone,
          transferReference,
          transferDate,
        },
        client
      );

      // 4. Actualiza os estados para 'PROOF_SUBMITTED'
      await paymentRepository.updateStatus(paymentId, 'PROOF_SUBMITTED', null, client);

      if (payment.registration_id) {
        await tournamentRepository.updateRegistrationStatus(
          payment.registration_id,
          'PROOF_SUBMITTED',
          null,
          null,
          client
        );
      }

      await notificationRepository.create(
        {
          userId,
          title: 'Comprovativo Recebido',
          message: `O seu comprovativo da referência ${payment.reference_code} foi recebido e está em fila de análise pelos moderadores.`,
          type: 'PAYMENT',
          link: `/tournaments/${payment.tournament_id}`,
        },
        client
      );

      logger.info(`Comprovativo bancário submetido com sucesso: ID=${proof.id} | Ref=${payment.reference_code} | Hash=${fileSha256}`);

      return proof;
    });
  },

  /**
   * Moderação Administrativa de Comprovativos Bancários:
   * - Aprovação: confirma pagamento, aprova inscrição no torneio e lança entrada contábil (Ledger).
   * - Rejeição: marca comprovativo como rejeitado com motivo explícito para o jogador reenviar.
   * 
   * @param {Object} data
   * @param {string} data.proofId - UUID
   * @param {string} data.adminUserId - UUID do moderador
   * @param {'APPROVE' | 'REJECT'} data.action
   * @param {string} [data.rejectionReason]
   * @param {string} [data.adminNotes]
   * @returns {Promise<Object>} Resultado da moderação
   */
  reviewProof: async ({
    proofId,
    adminUserId,
    action,
    rejectionReason = null,
    adminNotes = null,
  }) => {
    return await withTransaction(async (client) => {
      // 1. Localiza o comprovativo com metadados completos
      const proof = await paymentRepository.findProofById(proofId, client);
      if (!proof) {
        throw new AppError('Comprovativo não encontrado.', 404, 'PROOF_NOT_FOUND');
      }

      if (proof.status !== 'UNDER_REVIEW') {
        throw new AppError(
          'Este comprovativo já foi moderado anteriormente.',
          400,
          'PROOF_ALREADY_REVIEWED'
        );
      }

      // 2. Bloqueia o pagamento associado
      const payment = await paymentRepository.findByIdWithLock(proof.payment_id, client);

      // =======================================================================
      // FLUXO DE APROVAÇÃO
      // =======================================================================
      if (action === 'APPROVE') {
        // Actualiza comprovativo
        await paymentRepository.updateProofReview(
          proofId,
          'APPROVED',
          adminUserId,
          null,
          adminNotes,
          client
        );

        // Actualiza pagamento para 'APPROVED'
        await paymentRepository.updateStatus(payment.id, 'APPROVED', new Date(), client);

        // Actualiza a inscrição do torneio para 'APPROVED'
        if (payment.registration_id) {
          await tournamentRepository.updateRegistrationStatus(
            payment.registration_id,
            'APPROVED',
            adminUserId,
            null,
            client
          );
        }

        // Lança a receita oficial em AOA no livro contábil
        await paymentRepository.createTransaction(
          {
            paymentId: payment.id,
            userId: payment.user_id,
            type: 'TOURNAMENT_ENTRY_FEE',
            amount: payment.amount,
            currency: payment.currency,
            description: `Taxa de Inscrição aprovada no Torneio: ${proof.tournament_title || 'Oficial'} (Ref: ${payment.reference_code})`,
            performedBy: adminUserId,
          },
          client
        );

        // Notifica o jogador
        await notificationRepository.create(
          {
            userId: payment.user_id,
            title: 'Pagamento Aprovado!',
            message: `O seu pagamento de ${payment.amount} ${payment.currency} foi confirmado. A sua vaga no torneio está garantida!`,
            type: 'PAYMENT',
            link: `/tournaments/${payment.tournament_id}`,
          },
          client
        );

        // Grava no log de auditoria administrativo
        await auditRepository.createAuditLog(
          {
            adminUserId,
            action: 'APPROVE_PAYMENT',
            targetEntity: 'payments',
            targetId: payment.id,
            previousData: { status: payment.status },
            newData: { status: 'APPROVED', amount: payment.amount },
            notes: adminNotes || 'Comprovativo validado manualmente via extracto bancário.',
          },
          client
        );

        logger.audit('APPROVE_PAYMENT', {
          adminUserId,
          paymentId: payment.id,
          amount: payment.amount,
          userId: payment.user_id,
        });

        return { status: 'APPROVED', paymentId: payment.id };
      }

      // =======================================================================
      // FLUXO DE REJEIÇÃO
      // =======================================================================
      if (action === 'REJECT') {
        await paymentRepository.updateProofReview(
          proofId,
          'REJECTED',
          adminUserId,
          rejectionReason,
          adminNotes,
          client
        );

        await paymentRepository.updateStatus(payment.id, 'REJECTED', null, client);

        if (payment.registration_id) {
          await tournamentRepository.updateRegistrationStatus(
            payment.registration_id,
            'REJECTED',
            adminUserId,
            rejectionReason,
            client
          );
        }

        await notificationRepository.create(
          {
            userId: payment.user_id,
            title: 'Comprovativo Rejeitado',
            message: `O seu comprovativo da referência ${payment.reference_code} foi recusado: ${rejectionReason}. Por favor, envie um documento legível.`,
            type: 'PAYMENT',
            link: `/tournaments/${payment.tournament_id}/payment`,
          },
          client
        );

        await auditRepository.createAuditLog(
          {
            adminUserId,
            action: 'REJECT_PAYMENT',
            targetEntity: 'payments',
            targetId: payment.id,
            previousData: { status: payment.status },
            newData: { status: 'REJECTED', rejectionReason },
            notes: adminNotes,
          },
          client
        );

        logger.audit('REJECT_PAYMENT', {
          adminUserId,
          paymentId: payment.id,
          rejectionReason,
        });

        return { status: 'REJECTED', paymentId: payment.id };
      }

      throw new AppError('Acção de moderação inválida.', 400, 'INVALID_ACTION');
    });
  },

  /**
   * Valida a autorização e obtém com segurança o caminho físico do comprovativo para streaming protegido.
   * Apenas o próprio jogador ou administradores/moderadores podem visualizar o documento.
   * 
   * @param {string} proofId - UUID
   * @param {Object} user - Utilizador solicitante
   * @returns {Promise<{ filePath: string, mimeType: string, filename: string }>}
   */
  getSecureProofStreamData: async (proofId, user) => {
    const proof = await paymentRepository.findProofById(proofId);
    if (!proof) {
      throw new AppError('Comprovativo não encontrado.', 404, 'PROOF_NOT_FOUND');
    }

    const isOwner = proof.user_id === user.id;
    const isStaff = user.role === 'ADMIN' || user.role === 'MODERATOR' || user.roles?.includes('ADMIN');

    if (!isOwner && !isStaff) {
      throw new AppError('Não possui privilégios para aceder a este documento financeiro.', 403, 'FORBIDDEN');
    }

    const safePath = getSafeFilePath(env.STORAGE.uploadBaseDir, proof.file_path);

    return {
      filePath: safePath,
      mimeType: proof.mime_type,
      filename: proof.original_filename,
    };
  },
};

export default paymentService;