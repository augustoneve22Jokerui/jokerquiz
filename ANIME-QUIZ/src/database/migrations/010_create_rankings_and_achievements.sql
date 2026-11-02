-- ==============================================================================
-- MIGRAÇÃO 010: RANKINGS, HISTÓRICOS (SNAPSHOTS), CONQUISTAS E MEDALHAS
-- ==============================================================================

-- 1. Criação dos Tipos ENUM para Rankings e Conquistas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ranking_period_enum') THEN
    CREATE TYPE ranking_period_enum AS ENUM ('GLOBAL', 'WEEKLY', 'MONTHLY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'achievement_tier_enum') THEN
    CREATE TYPE achievement_tier_enum AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');
  END IF;
END $$;

-- 2. Tabela de Classificações Competitivas Activas (Rankings)
CREATE TABLE IF NOT EXISTS rankings (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period ranking_period_enum NOT NULL DEFAULT 'GLOBAL',
  period_identifier VARCHAR(30) NOT NULL DEFAULT 'ALL_TIME', -- Ex: 'ALL_TIME', '2026-W44', '2026-11'
  difficulty quiz_difficulty_enum, -- NULL para classificação geral ou valor específico de dificuldade
  score BIGINT NOT NULL DEFAULT 0 CHECK (score >= 0),
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  wins INT NOT NULL DEFAULT 0 CHECK (wins >= 0),
  matches_played INT NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  win_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (win_rate >= 0 AND win_rate <= 100),
  current_position INT NOT NULL DEFAULT 0,
  previous_position INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_ranking_period UNIQUE (user_id, period, period_identifier, difficulty)
);

-- 3. Tabela de Registos Históricos de Fim de Temporada (Ranking Snapshots)
-- Preserva pódios e pontuações consolidadas semanais/mensais para distribuição de recompensas
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id SERIAL PRIMARY KEY,
  period ranking_period_enum NOT NULL,
  period_identifier VARCHAR(30) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_position INT NOT NULL,
  score BIGINT NOT NULL DEFAULT 0,
  xp BIGINT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  rewards_granted JSONB DEFAULT '{}'::jsonb,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Conquistas e Insígnias Desbloqueáveis (Achievements)
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT NOT NULL DEFAULT '/assets/icons/achievement-default.svg',
  badge_tier achievement_tier_enum NOT NULL DEFAULT 'BRONZE',
  xp_reward INT NOT NULL DEFAULT 100 CHECK (xp_reward >= 0),
  criteria_type VARCHAR(50) NOT NULL, -- Ex: 'WINS_COUNT', 'PERFECT_SCORE', 'TOURNAMENT_CHAMPION', 'HOKAGE_STREAK'
  criteria_threshold INT NOT NULL DEFAULT 1 CHECK (criteria_threshold > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela Associativa de Conquistas do Jogador (User Achievements)
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
);

-- 6. Tabela de Medalhas de Torneios e Eventos Oficiais (Medals)
CREATE TABLE IF NOT EXISTS medals (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT NOT NULL DEFAULT '/assets/icons/medal-gold.svg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabela Associativa de Medalhas Concedidas (User Medals)
CREATE TABLE IF NOT EXISTS user_medals (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medal_id INT NOT NULL REFERENCES medals(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Índices para Renderização Instantânea de Tabelas de Classificação
CREATE INDEX IF NOT EXISTS idx_rankings_lookup ON rankings(period, period_identifier, current_position ASC);
CREATE INDEX IF NOT EXISTS idx_rankings_score ON rankings(period, period_identifier, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_user ON rankings(user_id);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_lookup ON ranking_snapshots(period, period_identifier, final_position ASC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_medals_user ON user_medals(user_id);

-- 9. Trigger de Atualização Automática de Timestamp na Tabela Rankings
DROP TRIGGER IF EXISTS trigger_rankings_updated_at ON rankings;
CREATE TRIGGER trigger_rankings_updated_at
BEFORE UPDATE ON rankings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();