import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados Financeiros e Pagamentos em Angola (AOA).
 * Gere pagamentos, submissão de comprovativos bancários e auditoria contábil de transacções.
 */
export const paymentRepository = {
  // ===========================================================================
  // MÓDULO: COBRANÇAS E PAGAMENTOS (PAYMENTS)
  // ===========================================================================

  /**
   * Cria um registo de pagamento com código de referência único.
   * 
   * @param {Object} data
   * @param {string} data.referenceCode - Ex: 'PAY-202611-AB12CD'
   * @param {string} data.userId - UUID
   * @param {string|null} [data.tournamentId=null] - UUID
   * @param {string|null} [data.registrationId=null] - UUID
   * @param {number} data.amount - Montante numérico em AOA
   * @param {string} [data.currency='AOA']
   * @param {string} [data.paymentMethod='BANK_TRANSFER'] - 'BANK_TRANSFER' ou 'MULTICAIXA_EXPRESS'
   * @param {Date} [data.expiresAt]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Registo de pagamento criado
   */
  create: async (
    {
      referenceCode,
      userId,
      tournamentId = null,
      registrationId = null,
      amount,
      currency = 'AOA',
      paymentMethod = 'BANK_TRANSFER',
      expiresAt = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO payments (
        reference_code,
        user_id,
        tournament_id,
        registration_id,
        amount,
        currency,
        payment_method,
        status,
        expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'PENDING_PAYMENT',
        COALESCE($8, CURRENT_TIMESTAMP + INTERVAL '24 hours')
      )
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      referenceCode,
      userId,
      tournamentId,
      registrationId,
      amount,
      currency,
      paymentMethod,
      expiresAt,
    ]);
    return rows[0];
  },

  /**
   * Localiza um pagamento pelo seu ID primário.
   * 
   * @param {string} id - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findById: async (id, client = null) => {
    const sql = `
      SELECT 
        p.*,
        u.username,
        u.email,
        prof.display_name,
        prof.phone_number,
        t.title AS tournament_title,
        t.slug AS tournament_slug
      FROM payments p
      INNER JOIN users u ON u.id = p.user_id
      LEFT JOIN user_profiles prof ON prof.user_id = u.id
      LEFT JOIN tournaments t ON t.id = p.tournament_id
      WHERE p.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza um pagamento pelo seu código de referência único.
   * 
   * @param {string} referenceCode
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByReference: async (referenceCode, client = null) => {
    const sql = `
      SELECT 
        p.*,
        u.username,
        u.email,
        prof.display_name,
        t.title AS tournament_title
      FROM payments p
      INNER JOIN users u ON u.id = p.user_id
      LEFT JOIN user_profiles prof ON prof.user_id = u.id
      LEFT JOIN tournaments t ON t.id = p.tournament_id
      WHERE UPPER(p.reference_code) = UPPER($1);
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [referenceCode]);
    return rows[0] || null;
  },

  /**
   * Bloqueia a linha do pagamento para operações financeiras exclusivas com controlo de concorrência.
   * 
   * @param {string} paymentId - UUID
   * @param {import('pg').PoolClient} client
   * @returns {Promise<Object|null>}
   */
  findByIdWithLock: async (paymentId, client) => {
    const sql = `
      SELECT *
      FROM payments
      WHERE id = $1
      FOR UPDATE;
    `;
    const { rows } = await client.query(sql, [paymentId]);
    return rows[0] || null;
  },

  /**
   * Actualiza o estado do pagamento.
   * 
   * @param {string} paymentId - UUID
   * @param {string} status - 'APPROVED', 'REJECTED', 'PROOF_SUBMITTED', etc.
   * @param {Date|null} [paidAt=null]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateStatus: async (paymentId, status, paidAt = null, client = null) => {
    const sql = `
      UPDATE payments
      SET 
        status = $2,
        paid_at = CASE WHEN $2 = 'APPROVED' THEN COALESCE($3, CURRENT_TIMESTAMP) ELSE paid_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [paymentId, status, paidAt]);
    return rows[0] || null;
  },

  /**
   * Lista pagamentos paginados para o painel administrativo com filtros avançados.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {string} [options.status]
   * @param {string} [options.search='']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ payments: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findAllPaginated: async (
    { page = 1, limit = 15, status = null, search = '' },
    client = null
  ) => {
    const offset = (page - 1) * limit;
    const searchTerm = `%${search.trim().toLowerCase()}%`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM payments p
      INNER JOIN users u ON u.id = p.user_id
      WHERE ($1::tournament_registration_status_enum IS NULL OR p.status = $1)
        AND ($2 = '%%' OR LOWER(p.reference_code) LIKE $2 OR LOWER(u.username) LIKE $2);
    `;

    const dataSql = `
      SELECT 
        p.*,
        u.username,
        u.email,
        prof.display_name,
        t.title AS tournament_title,
        (SELECT COUNT(*) FROM payment_proofs pp WHERE pp.payment_id = p.id) AS proofs_count
      FROM payments p
      INNER JOIN users u ON u.id = p.user_id
      LEFT JOIN user_profiles prof ON prof.user_id = u.id
      LEFT JOIN tournaments t ON t.id = p.tournament_id
      WHERE ($1::tournament_registration_status_enum IS NULL OR p.status = $1)
        AND ($2 = '%%' OR LOWER(p.reference_code) LIKE $2 OR LOWER(u.username) LIKE $2)
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [status, searchTerm]),
      executor(dataSql, [status, searchTerm, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      payments: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: COMPROVATIVOS BANCÁRIOS (PAYMENT PROOFS)
  // ===========================================================================

  /**
   * Grava os metadados do comprovativo bancário enviado pelo jogador.
   * 
   * @param {Object} data
   * @param {string} data.paymentId - UUID
   * @param {string} data.userId - UUID
   * @param {string} data.filePath - Caminho privado em storage/uploads/proofs/
   * @param {string} data.originalFilename
   * @param {number} data.fileSizeBytes
   * @param {string} data.mimeType
   * @param {string} data.fileSha256 - Hash SHA-256 único do arquivo
   * @param {string} [data.payerName]
   * @param {string} [data.payerAccountOrPhone]
   * @param {string} [data.transferReference]
   * @param {string} [data.transferDate]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Comprovativo criado
   */
  createProof: async (
    {
      paymentId,
      userId,
      filePath,
      originalFilename,
      fileSizeBytes,
      mimeType,
      fileSha256,
      payerName = null,
      payerAccountOrPhone = null,
      transferReference = null,
      transferDate = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO payment_proofs (
        payment_id,
        user_id,
        file_path,
        original_filename,
        file_size_bytes,
        mime_type,
        file_sha256,
        payer_name,
        payer_account_or_phone,
        transfer_reference,
        transfer_date,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'UNDER_REVIEW')
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      paymentId,
      userId,
      filePath,
      originalFilename,
      fileSizeBytes,
      mimeType,
      fileSha256,
      payerName,
      payerAccountOrPhone,
      transferReference,
      transferDate,
    ]);
    return rows[0];
  },

  /**
   * Verifica se já existe um comprovativo registado com o mesmo hash SHA-256 (Anti-Fraude).
   * 
   * @param {string} sha256 - Hash do ficheiro
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findBySha256: async (sha256, client = null) => {
    const sql = `SELECT id, payment_id, submitted_at FROM payment_proofs WHERE file_sha256 = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [sha256]);
    return rows[0] || null;
  },

  /**
   * Localiza um comprovativo pelo seu ID com dados completos para análise de moderação.
   * 
   * @param {string} proofId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findProofById: async (proofId, client = null) => {
    const sql = `
      SELECT 
        pp.*,
        p.reference_code,
        p.amount,
        p.currency,
        p.payment_method,
        p.status AS payment_status,
        u.username AS player_username,
        u.email AS player_email,
        prof.display_name AS player_display_name,
        rev.username AS reviewer_username,
        t.title AS tournament_title
      FROM payment_proofs pp
      INNER JOIN payments p ON p.id = pp.payment_id
      INNER JOIN users u ON u.id = pp.user_id
      LEFT JOIN user_profiles prof ON prof.user_id = u.id
      LEFT JOIN users rev ON rev.id = pp.reviewed_by
      LEFT JOIN tournaments t ON t.id = p.tournament_id
      WHERE pp.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [proofId]);
    return rows[0] || null;
  },

  /**
   * Actualiza o estado de revisão de um comprovativo bancário.
   * 
   * @param {string} proofId - UUID
   * @param {'APPROVED' | 'REJECTED'} status
   * @param {string} reviewedBy - UUID do moderador/administrador
   * @param {string|null} [rejectionReason]
   * @param {string|null} [adminNotes]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateProofReview: async (
    proofId,
    status,
    reviewedBy,
    rejectionReason = null,
    adminNotes = null,
    client = null
  ) => {
    const sql = `
      UPDATE payment_proofs
      SET 
        status = $2,
        reviewed_by = $3,
        reviewed_at = CURRENT_TIMESTAMP,
        rejection_reason = $4,
        admin_notes = $5
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      proofId,
      status,
      reviewedBy,
      rejectionReason,
      adminNotes,
    ]);
    return rows[0] || null;
  },

  // ===========================================================================
  // MÓDULO: TRANSAÇÕES CONTÁBEIS E HISTÓRICO FINANCEIRO
  // ===========================================================================

  /**
   * Grava uma transacção financeira imutável no livro de contabilidade (Ledger).
   * 
   * @param {Object} data
   * @param {string|null} [data.paymentId=null] - UUID
   * @param {string} data.userId - UUID
   * @param {string} data.type - 'TOURNAMENT_ENTRY_FEE', 'PRIZE_PAYOUT', 'REFUND', 'SYSTEM_ADJUSTMENT'
   * @param {number} data.amount - Valor numérico
   * @param {string} [data.currency='AOA']
   * @param {number} [data.balanceAfter=0]
   * @param {string} data.description
   * @param {string|null} [data.performedBy=null] - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createTransaction: async (
    {
      paymentId = null,
      userId,
      type,
      amount,
      currency = 'AOA',
      balanceAfter = 0,
      description,
      performedBy = null,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO transactions (
        payment_id,
        user_id,
        type,
        amount,
        currency,
        balance_after,
        description,
        performed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      paymentId,
      userId,
      type,
      amount,
      currency,
      balanceAfter,
      description,
      performedBy,
    ]);
    return rows[0];
  },
};

export default paymentRepository;