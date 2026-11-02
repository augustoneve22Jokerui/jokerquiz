-- ==============================================================================
-- MIGRAÇÃO 004: ANIMES, PERSONAGENS E CATEGORIAS DE QUIZ
-- ==============================================================================

-- 1. Tabela de Animes (Actua também como cache persistente da Jikan / MyAnimeList API)
CREATE TABLE IF NOT EXISTS animes (
  id SERIAL PRIMARY KEY,
  mal_id INT UNIQUE,
  title VARCHAR(255) NOT NULL,
  title_english VARCHAR(255),
  title_japanese VARCHAR(255),
  slug VARCHAR(255) UNIQUE NOT NULL,
  synopsis TEXT,
  image_url TEXT NOT NULL DEFAULT '/assets/images/placeholders/anime-cover.png',
  banner_url TEXT,
  episodes INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Finished Airing',
  score NUMERIC(4, 2) DEFAULT 0.00,
  genres TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Personagens dos Universos de Anime
CREATE TABLE IF NOT EXISTS anime_characters (
  id SERIAL PRIMARY KEY,
  anime_id INT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  mal_id INT,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Main',
  image_url TEXT NOT NULL DEFAULT '/assets/images/placeholders/character.png',
  about TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Categorias Temáticas do Quiz
CREATE TABLE IF NOT EXISTS quiz_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  icon_name VARCHAR(50) NOT NULL DEFAULT 'sparkles',
  color_hex VARCHAR(10) NOT NULL DEFAULT '#00f2fe',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Índices para Pesquisas Rápidas e Matchmaking
CREATE INDEX IF NOT EXISTS idx_animes_mal_id ON animes(mal_id);
CREATE INDEX IF NOT EXISTS idx_animes_slug ON animes(slug);
CREATE INDEX IF NOT EXISTS idx_animes_title ON animes(LOWER(title));
CREATE INDEX IF NOT EXISTS idx_animes_is_active ON animes(is_active);

CREATE INDEX IF NOT EXISTS idx_anime_characters_anime_id ON anime_characters(anime_id);
CREATE INDEX IF NOT EXISTS idx_anime_characters_name ON anime_characters(LOWER(name));

CREATE INDEX IF NOT EXISTS idx_quiz_categories_slug ON quiz_categories(slug);
CREATE INDEX IF NOT EXISTS idx_quiz_categories_is_active ON quiz_categories(is_active);

-- 5. Triggers de Atualização Automática de Timestamp
DROP TRIGGER IF EXISTS trigger_animes_updated_at ON animes;
CREATE TRIGGER trigger_animes_updated_at
BEFORE UPDATE ON animes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_anime_characters_updated_at ON anime_characters;
CREATE TRIGGER trigger_anime_characters_updated_at
BEFORE UPDATE ON anime_characters
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_quiz_categories_updated_at ON quiz_categories;
CREATE TRIGGER trigger_quiz_categories_updated_at
BEFORE UPDATE ON quiz_categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();