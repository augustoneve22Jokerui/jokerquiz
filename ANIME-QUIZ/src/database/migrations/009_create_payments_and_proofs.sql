-- ==============================================================================
-- MIGRAÇÃO 009: PAGAMENTOS (AOA), COMPROVATIVOS BANCÁRIOS E TRANSAÇÕES
-- ==============================================================================

-- 1. Criação do Tipo ENUM para Métodos de Pagamento em Angola
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
    CREATE TYPE payment_method_enum AS ENUM (
      'BANK_TRANSFER',
      'MULTICAIXA_EXPRESS'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proof_status_enum') THEN
    CREATE TYPE proof_status_enum AS ENUM (
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type_enum') THEN
    CREATE TYPE transaction_type_enum AS ENUM (
      'TOURNAMENT_ENTRY_FEE',
      'PRIZE_PAYOUT',
      'REFUND',
      'SYSTEM_ADJUSTMENT'
    );
  END IF;
END $$;

-- 2. Tabela de Cobranças e Pagamentos (Payments)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code VARCHAR(32) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES tournament_registrations(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'AOA',
  payment_method payment_method_enum NOT NULL DEFAULT 'BANK_TRANSFER',
  status tournament_registration_status_enum NOT NULL DEFAULT 'PENDING_PAYMENT',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Comprovativos Bancários Enviados (Payment Proofs)
-- Armazena os metadados e o hash criptográfico SHA-256 do ficheiro físico (guardado fora da pasta pública)
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size_bytes INT NOT NULL CHECK (file_size_bytes > 0),
  mime_type VARCHAR(100) NOT NULL,
  file_sha256 VARCHAR(64) UNIQUE NOT NULL,
  payer_name VARCHAR(150),
  payer_account_or_phone VARCHAR(50),
  transfer_reference VARCHAR(100),
  transfer_date DATE,
  status proof_status_enum NOT NULL DEFAULT 'UNDER_REVIEW',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  admin_notes TEXT
);

-- 4. Tabela de Histórico Financeiro e Auditoria de Transações (Transactions)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type transaction_type_enum NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'AOA',
  balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  description TEXT NOT NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Índices para Pesquisas, Auditoria e Integridade Financeira
CREATE INDEX IF NOT EXISTS idx_payments_reference_code ON payments(reference_code);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_tournament_id ON payments(tournament_id);
CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment_id ON payment_proofs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_user_id ON payment_proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_sha256 ON payment_proofs(file_sha256);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- 6. Trigger de Atualização Automática de Timestamp
DROP TRIGGER IF EXISTS trigger_payments_updated_at ON payments;
CREATE TRIGGER trigger_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();