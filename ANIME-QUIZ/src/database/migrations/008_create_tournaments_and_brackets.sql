-- ==============================================================================
-- MIGRAÇÃO 008: TORNEIOS, ELIMINATÓRIAS (BRACKETS) E INSCRIÇÕES
-- ==============================================================================

-- 1. Criação dos Tipos ENUM para Torneios e Partidas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status_enum') THEN
    CREATE TYPE tournament_status_enum AS ENUM (
      'DRAFT',
      'PUBLISHED',
      'REGISTRATION_OPEN',
      'REGISTRATION_CLOSED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_registration_status_enum') THEN
    CREATE TYPE tournament_registration_status_enum AS ENUM (
      'PENDING_PAYMENT',
      'PROOF_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
      'REFUNDED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_match_status_enum') THEN
    CREATE TYPE tournament_match_status_enum AS ENUM (
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'WALKOVER',
      'CANCELLED'
    );
  END IF;
END $$;

-- 2. Tabela Principal de Torneios
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(180) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  rules TEXT NOT NULL,
  banner_url TEXT NOT NULL DEFAULT '/assets/images/placeholders/tournament-banner.png',
  difficulty quiz_difficulty_enum NOT NULL DEFAULT 'PROFISSIONAL',
  category_id INT REFERENCES quiz_categories(id) ON DELETE SET NULL,
  max_participants INT NOT NULL DEFAULT 16 CHECK (max_participants IN (4, 8, 16, 32, 64, 128)),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  entry_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (entry_fee >= 0),
  prize_pool NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (prize_pool >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'AOA',
  status tournament_status_enum NOT NULL DEFAULT 'DRAFT',
  registration_start_at TIMESTAMPTZ NOT NULL,
  registration_end_at TIMESTAMPTZ NOT NULL,
  tournament_start_at TIMESTAMPTZ NOT NULL,
  tournament_end_at TIMESTAMPTZ,
  champion_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_tournament_dates CHECK (
    registration_start_at < registration_end_at AND
    registration_end_at <= tournament_start_at
  )
);

-- 3. Tabela de Inscrições de Jogadores no Torneio
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status tournament_registration_status_enum NOT NULL DEFAULT 'PENDING_PAYMENT',
  seed_number INT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  CONSTRAINT uq_tournament_user UNIQUE (tournament_id, user_id)
);

-- 4. Tabela de Fases / Rondas Eliminatórias (Rounds)
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id SERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  name VARCHAR(60) NOT NULL, -- Ex: 'Oitavas de Final', 'Quartos de Final', 'Meias-Finais', 'Grande Final'
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tournament_round UNIQUE (tournament_id, round_number)
);

-- 5. Tabela de Duelos / Confrontos Individuais (Matches)
CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id INT NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  match_number INT NOT NULL,
  player1_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  player2_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  player1_score INT NOT NULL DEFAULT 0 CHECK (player1_score >= 0),
  player2_score INT NOT NULL DEFAULT 0 CHECK (player2_score >= 0),
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status tournament_match_status_enum NOT NULL DEFAULT 'SCHEDULED',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Índices para Otimização de Chaves, Inscrições e Vagas Concorrentes
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_category_id ON tournaments(category_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_at ON tournaments(tournament_start_at);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user ON tournament_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_status ON tournament_registrations(tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament ON tournament_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_players ON tournament_matches(player1_user_id, player2_user_id);

-- 7. Trigger de Atualização Automática de Timestamp
DROP TRIGGER IF EXISTS trigger_tournaments_updated_at ON tournaments;
CREATE TRIGGER trigger_tournaments_updated_at
BEFORE UPDATE ON tournaments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();