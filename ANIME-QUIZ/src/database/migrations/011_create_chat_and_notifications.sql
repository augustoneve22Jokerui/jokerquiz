-- ==============================================================================
-- MIGRAÇÃO 011: CHAT EM TEMPO REAL, CANAIS, MENSAGENS E NOTIFICAÇÕES
-- ==============================================================================

-- 1. Criação dos Tipos ENUM para Chat e Notificações
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type_enum') THEN
    CREATE TYPE conversation_type_enum AS ENUM (
      'GLOBAL',
      'ROOM',
      'TOURNAMENT',
      'DIRECT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum') THEN
    CREATE TYPE notification_type_enum AS ENUM (
      'SYSTEM',
      'TOURNAMENT',
      'PAYMENT',
      'ACHIEVEMENT',
      'ROOM_INVITE',
      'SECURITY'
    );
  END IF;
END $$;

-- 2. Tabela de Conversações / Canais de Chat (Conversations)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type_enum NOT NULL DEFAULT 'GLOBAL',
  title VARCHAR(100),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Membros do Canal de Chat (Conversation Members)
CREATE TABLE IF NOT EXISTS conversation_members (
  id SERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER', 'MODERATOR', 'ADMIN')),
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  muted_until TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_conversation_member UNIQUE (conversation_id, user_id)
);

-- 4. Tabela de Mensagens do Chat com Auditoria de Moderação
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content VARCHAR(1000) NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela de Notificações do Utilizador (Alertas de Pagamento, Torneios e Conquistas)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type notification_type_enum NOT NULL DEFAULT 'SYSTEM',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Índices para Recuperação Ultra-Rápida de Mensagens e Notificações Pendentes
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_room ON conversations(room_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tournament ON conversations(tournament_id);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conv ON conversation_members(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- 7. Trigger de Atualização Automática de Timestamp na Tabela Conversations
DROP TRIGGER IF EXISTS trigger_conversations_updated_at ON conversations;
CREATE TRIGGER trigger_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();