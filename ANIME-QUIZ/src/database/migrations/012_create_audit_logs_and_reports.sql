-- ==============================================================================
-- MIGRAÇÃO 012: AUDITORIA ADMINISTRATIVA, DENÚNCIAS E CONFIGURAÇÕES DE SISTEMA
-- ==============================================================================

-- 1. Criação dos Tipos ENUM para Denúncias e Relatórios
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_reason_enum') THEN
    CREATE TYPE report_reason_enum AS ENUM (
      'CHEATING_SUSPICION',
      'TOXICITY',
      'OFFENSIVE_CONTENT',
      'SPAM',
      'PAYMENT_FRAUD',
      'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status_enum') THEN
    CREATE TYPE report_status_enum AS ENUM (
      'PENDING',
      'INVESTIGATING',
      'RESOLVED',
      'DISMISSED'
    );
  END IF;
END $$;

-- 2. Tabela de Denúncias e Moderação da Comunidade (Reports)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reported_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  reported_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  reason report_reason_enum NOT NULL DEFAULT 'OTHER',
  description TEXT NOT NULL,
  status report_status_enum NOT NULL DEFAULT 'PENDING',
  resolution_notes TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Registos de Auditoria de Operações Administrativas (Audit Logs)
-- Regista acções sensíveis: aprovação/rejeição de pagamentos em AOA, banimento de contas e alterações de torneios
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(100) NOT NULL, -- Ex: 'APPROVE_PAYMENT', 'REJECT_PAYMENT', 'BAN_USER', 'CREATE_TOURNAMENT'
  target_entity VARCHAR(50) NOT NULL, -- Ex: 'payments', 'users', 'tournaments', 'questions'
  target_id VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  previous_data JSONB,
  new_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Parâmetros Operacionais e Definições Dinâmicas (System Settings)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type VARCHAR(20) NOT NULL DEFAULT 'STRING' CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')),
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Índices para Pesquisas Administrativas e Auditoria Contínua
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON admin_audit_logs(target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- 6. Trigger de Atualização Automática de Timestamp na Tabela System Settings
DROP TRIGGER IF EXISTS trigger_system_settings_updated_at ON system_settings;
CREATE TRIGGER trigger_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();