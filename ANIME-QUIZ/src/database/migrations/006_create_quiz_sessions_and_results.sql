-- ==============================================================================
-- MIGRAÇÃO 006: SESSÕES DE QUIZ, RESPOSTAS E RESULTADOS HISTÓRICOS
-- ==============================================================================

-- 1. Criação do Tipo ENUM para Modo de Quiz Individual
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_mode_enum') THEN
    CREATE TYPE quiz_mode_enum AS ENUM ('TREINO', 'RANQUEADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_session_status_enum') THEN
    CREATE TYPE quiz_session_status_enum AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'TIMED_OUT');
  END IF;
END $$;

-- 2. Tabela de Sessões de Quiz Individual (Solo Run)
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode quiz_mode_enum NOT NULL DEFAULT 'TREINO',
  difficulty quiz_difficulty_enum NOT NULL DEFAULT 'INICIANTE',
  category_id INT REFERENCES quiz_categories(id) ON DELETE SET NULL,
  total_questions INT NOT NULL DEFAULT 10 CHECK (total_questions > 0),
  current_question_index INT NOT NULL DEFAULT 0,
  status quiz_session_status_enum NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Respostas Submetidas em Cada Questão da Sessão
CREATE TABLE IF NOT EXISTS quiz_session_answers (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES quiz_questions(id) ON DELETE RESTRICT,
  selected_answer_id INT REFERENCES quiz_answers(id) ON DELETE SET NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  response_time_ms INT NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
  points_awarded INT NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  xp_awarded INT NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Resultados Consolidados da Sessão (Histórico e Auditoria)
CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct_answers INT NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  incorrect_answers INT NOT NULL DEFAULT 0 CHECK (incorrect_answers >= 0),
  unanswered INT NOT NULL DEFAULT 0 CHECK (unanswered >= 0),
  accuracy_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (accuracy_percentage >= 0 AND accuracy_percentage <= 100),
  total_score INT NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  total_xp INT NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  time_spent_seconds INT NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Índices de Desempenho e Auditoria
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_id ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status ON quiz_sessions(status);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_mode ON quiz_sessions(mode);
CREATE INDEX IF NOT EXISTS idx_quiz_session_answers_session_id ON quiz_session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_session_answers_question_id ON quiz_session_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_created_at ON quiz_results(created_at DESC);