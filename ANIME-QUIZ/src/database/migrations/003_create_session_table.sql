-- ==============================================================================
-- MIGRAÇÃO 003: TABELA DE SESSÕES PERSISTENTES (CONNECT-PG-SIMPLE)
-- ==============================================================================

-- 1. Criação da Tabela de Sessões HTTP / WebSocket
-- Esta tabela é gerida pela biblioteca connect-pg-simple em conjunto com o Express.
-- Armazena os cookies de sessão assinados dos utilizadores autenticados.
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ(6) NOT NULL
);

-- 2. Índice para Limpeza Eficiente de Sessões Expiradas
-- Permite que a rotina periódica de descarte (pruneSessionInterval)
-- execute DELETEs rápidos sem varrimento sequencial na tabela.
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions(expire);