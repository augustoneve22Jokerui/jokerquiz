import { z } from 'zod';

/**
 * Esquema de validação para submissão dos dados do comprovativo bancário
 * (Transferência Bancária / Multicaixa Express em Angola).
 */
export const submitPaymentProofSchema = z.object({
  paymentId: z
    .string({ required_error: 'O identificador do pagamento é obrigatório.' })
    .uuid('Identificador de pagamento deve ser um UUID válido.'),

  payerName: z
    .string({ required_error: 'O nome do titular/ordenante do pagamento é obrigatório.' })
    .trim()
    .min(3, 'O nome do titular deve ter no mínimo 3 caracteres.')
    .max(150, 'O nome do titular não pode exceder 150 caracteres.'),

  payerAccountOrPhone: z
    .string()
    .trim()
    .min(3, 'Contacto telefónico ou conta de origem inválida.')
    .max(50)
    .optional()
    .or(z.literal('')),

  transferReference: z
    .string()
    .trim()
    .max(100, 'A referência da operação não pode exceder 100 caracteres.')
    .optional()
    .or(z.literal('')),

  transferDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data da transferência deve estar no formato AAAA-MM-DD.')
    .optional()
    .or(z.literal('')),
});

/**
 * Esquema de validação para revisão administrativa de comprovativos de pagamento.
 * Moderação humana: aprovação ou rejeição com justificativa obrigatória.
 */
export const reviewPaymentProofSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT'], {
      required_error: 'A acção de moderação é obrigatória (APPROVE ou REJECT).',
    }),

    rejectionReason: z
      .string()
      .trim()
      .max(500, 'O motivo de rejeição não pode exceder 500 caracteres.')
      .optional()
      .or(z.literal('')),

    adminNotes: z
      .string()
      .trim()
      .max(500, 'As notas internas de moderação não podem exceder 500 caracteres.')
      .optional()
      .or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.action === 'REJECT' && (!data.rejectionReason || data.rejectionReason.length < 5)) {
        return false;
      }
      return true;
    },
    {
      message: 'Ao rejeitar um comprovativo bancário, deve fornecer um motivo claro de pelo menos 5 caracteres.',
      path: ['rejectionReason'],
    }
  );

/**
 * Esquema de validação para parâmetros de rota contendo ID de pagamento.
 */
export const paymentIdParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador do pagamento é obrigatório.' })
    .uuid('Identificador de pagamento deve ser um UUID válido.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo o código de referência do pagamento.
 */
export const paymentReferenceParamSchema = z.object({
  reference: z
    .string({ required_error: 'O código de referência é obrigatório.' })
    .trim()
    .min(5, 'Código de referência inválido.')
    .max(32, 'Código de referência inválido.'),
});

/**
 * Esquema de validação para filtros e histórico de pagamentos no painel administrativo.
 */
export const paymentFilterQuerySchema = z.object({
  status: z
    .enum([
      'PENDING_PAYMENT',
      'PROOF_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
      'REFUNDED',
    ])
    .optional(),

  paymentMethod: z
    .enum(['BANK_TRANSFER', 'MULTICAIXA_EXPRESS'])
    .optional(),

  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(15),
});

export default {
  submitPaymentProofSchema,
  reviewPaymentProofSchema,
  paymentIdParamSchema,
  paymentReferenceParamSchema,
  paymentFilterQuerySchema,
};