-- ==============================================================================
-- MIGRAÇÃO 007: SALAS MULTIPLAYER, JOGADORES E CONVITES EM TEMPO REAL
-- ==============================================================================

-- 1. Criação do Tipo ENUM para o Ciclo de Vida da Sala Multiplayer
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_status_enum') THEN
    CREATE TYPE room_status_enum AS ENUM (
      'LOBBY',
      'STARTING',
      'IN_GAME',
      'FINISHED',
      'CANCELLED'
    );
  END IF;
END $$;

-- 2. Tabela de Salas Multiplayer (Lobbies e Arenas)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash VARCHAR(255),
  max_players INT NOT NULL DEFAULT 8 CHECK (max_players >= 2 AND max_players <= 32),
  difficulty quiz_difficulty_enum NOT NULL DEFAULT 'MEDIO',
  category_id INT REFERENCES quiz_categories(id) ON DELETE SET NULL,
  questions_count INT NOT NULL DEFAULT 10 CHECK (questions_count >= 5 AND questions_count <= 50),
  time_per_question INT NOT NULL DEFAULT 15 CHECK (time_per_question >= 5 AND time_per_question <= 60),
  status room_status_enum NOT NULL DEFAULT 'LOBBY',
  current_question_index INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Participantes da Sala (Room Players)
CREATE TABLE IF NOT EXISTS room_players (
  id SERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  correct_answers INT NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  rank_position INT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMPTZ,
  CONSTRAINT uq_room_player UNIQUE (room_id, user_id)
);

-- 4. Tabela de Convites Diretos para Salas
CREATE TABLE IF NOT EXISTS room_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Índices para Otimização de Consultas em Tempo Real e Listagem de Lobbies
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_is_private ON rooms(is_private);
CREATE INDEX IF NOT EXISTS idx_rooms_host_user_id ON rooms(host_user_id);

CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_room_players_score ON room_players(room_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_room_invitations_invitee ON room_invitations(invitee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_room_invitations_room ON room_invitations(room_id);

-- 6. Trigger de Atualização Automática de Timestamp
DROP TRIGGER IF EXISTS trigger_rooms_updated_at ON rooms;
CREATE TRIGGER trigger_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();