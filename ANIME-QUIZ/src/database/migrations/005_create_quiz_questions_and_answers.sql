-- ==============================================================================
-- MIGRAÇÃO 005: PERGUNTAS E RESPOSTAS DO QUIZ (TREINO E RANQUEADO)
-- ==============================================================================

-- 1. Criação do Tipo ENUM para as Quatro Dificuldades Oficiais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_difficulty_enum') THEN
    CREATE TYPE quiz_difficulty_enum AS ENUM (
      'INICIANTE',
      'MEDIO',
      'PROFISSIONAL',
      'HOKAGE'
    );
  END IF;
END $$;

-- 2. Tabela de Perguntas do Quiz
CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES quiz_categories(id) ON DELETE RESTRICT,
  anime_id INT REFERENCES animes(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  image_url TEXT,
  difficulty quiz_difficulty_enum NOT NULL DEFAULT 'INICIANTE',
  explanation TEXT,
  time_limit_seconds INT NOT NULL DEFAULT 15 CHECK (time_limit_seconds >= 5 AND time_limit_seconds <= 60),
  base_points INT NOT NULL DEFAULT 100 CHECK (base_points > 0),
  base_xp INT NOT NULL DEFAULT 25 CHECK (base_xp > 0),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Alternativas / Respostas da Pergunta
CREATE TABLE IF NOT EXISTS quiz_answers (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer_text VARCHAR(500) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 1 CHECK (display_order >= 1 AND display_order <= 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Índices para Seleção Dinâmica, Matchmaking e Anti-Cheat
CREATE INDEX IF NOT EXISTS idx_quiz_questions_category_id ON quiz_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_anime_id ON quiz_questions(anime_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_is_published ON quiz_questions(is_published);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id ON quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_is_correct ON quiz_answers(question_id, is_correct);

-- 5. Trigger de Atualização Automática de Timestamp
DROP TRIGGER IF EXISTS trigger_quiz_questions_updated_at ON quiz_questions;
CREATE TRIGGER trigger_quiz_questions_updated_at
BEFORE UPDATE ON quiz_questions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();