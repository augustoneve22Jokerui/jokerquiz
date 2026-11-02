import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados de Animes, Personagens e Categorias Temáticas.
 * Fornece persistência direta e cache relacional para a integração com a API Jikan (MyAnimeList).
 */
export const animeRepository = {
  // ===========================================================================
  // MÓDULO: ANIMES (CATÁLOGO & CACHE)
  // ===========================================================================

  /**
   * Localiza um anime pelo seu ID numérico primário.
   * 
   * @param {number} id
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findById: async (id, client = null) => {
    const sql = `
      SELECT 
        a.*,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.anime_id = a.id AND q.is_published = TRUE) AS total_questions
      FROM animes a
      WHERE a.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza um anime pelo seu slug identificador único.
   * 
   * @param {string} slug
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findBySlug: async (slug, client = null) => {
    const sql = `
      SELECT 
        a.*,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.anime_id = a.id AND q.is_published = TRUE) AS total_questions
      FROM animes a
      WHERE a.slug = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [slug]);
    return rows[0] || null;
  },

  /**
   * Localiza um anime pelo ID oficial da MyAnimeList (Jikan API).
   * 
   * @param {number} malId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByMalId: async (malId, client = null) => {
    const sql = `
      SELECT * FROM animes WHERE mal_id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [malId]);
    return rows[0] || null;
  },

  /**
   * Insere ou actualiza um anime sincronizado da API Jikan de forma idempotente.
   * 
   * @param {Object} data
   * @param {number} data.malId
   * @param {string} data.title
   * @param {string} [data.titleEnglish]
   * @param {string} [data.titleJapanese]
   * @param {string} data.slug
   * @param {string} [data.synopsis]
   * @param {string} data.imageUrl
   * @param {string} [data.bannerUrl]
   * @param {number} [data.episodes=0]
   * @param {number} [data.score=0]
   * @param {string} [data.status='Finished Airing']
   * @param {Array<string>} [data.genres=[]]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Registo de anime guardado
   */
  upsert: async (
    {
      malId,
      title,
      titleEnglish = null,
      titleJapanese = null,
      slug,
      synopsis = '',
      imageUrl,
      bannerUrl = null,
      episodes = 0,
      score = 0,
      status = 'Finished Airing',
      genres = [],
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO animes (
        mal_id,
        title,
        title_english,
        title_japanese,
        slug,
        synopsis,
        image_url,
        banner_url,
        episodes,
        score,
        status,
        genres,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
      ON CONFLICT (slug) DO UPDATE SET
        mal_id = EXCLUDED.mal_id,
        title = EXCLUDED.title,
        title_english = EXCLUDED.title_english,
        title_japanese = EXCLUDED.title_japanese,
        synopsis = EXCLUDED.synopsis,
        image_url = EXCLUDED.image_url,
        banner_url = COALESCE(EXCLUDED.banner_url, animes.banner_url),
        episodes = EXCLUDED.episodes,
        score = EXCLUDED.score,
        status = EXCLUDED.status,
        genres = EXCLUDED.genres,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      malId,
      title,
      titleEnglish,
      titleJapanese,
      slug,
      synopsis,
      imageUrl,
      bannerUrl,
      episodes,
      score,
      status,
      genres,
    ]);
    return rows[0];
  },

  /**
   * Lista animes do catálogo com filtros de pesquisa, paginação e contagem de perguntas.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=12]
   * @param {string} [options.search='']
   * @param {boolean} [options.onlyActive=true]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ animes: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findPaginated: async ({ page = 1, limit = 12, search = '', onlyActive = true }, client = null) => {
    const offset = (page - 1) * limit;
    const searchTerm = `%${search.trim().toLowerCase()}%`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM animes
      WHERE ($1 = FALSE OR is_active = TRUE)
        AND ($2 = '%%' OR LOWER(title) LIKE $2 OR LOWER(title_english) LIKE $2);
    `;

    const dataSql = `
      SELECT 
        a.*,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.anime_id = a.id AND q.is_published = TRUE) AS total_questions
      FROM animes a
      WHERE ($1 = FALSE OR a.is_active = TRUE)
        AND ($2 = '%%' OR LOWER(a.title) LIKE $2 OR LOWER(a.title_english) LIKE $2)
      ORDER BY a.score DESC, a.title ASC
      LIMIT $3 OFFSET $4;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [onlyActive, searchTerm]),
      executor(dataSql, [onlyActive, searchTerm, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      animes: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: PERSONAGENS DE ANIME
  // ===========================================================================

  /**
   * Obtém a lista de personagens associados a um determinado anime.
   * 
   * @param {number} animeId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findCharactersByAnimeId: async (animeId, client = null) => {
    const sql = `
      SELECT * 
      FROM anime_characters 
      WHERE anime_id = $1 
      ORDER BY role ASC, name ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [animeId]);
    return rows;
  },

  /**
   * Insere um personagem associado a um anime.
   * 
   * @param {Object} data
   * @param {number} data.animeId
   * @param {number} [data.malId]
   * @param {string} data.name
   * @param {string} [data.role='Main']
   * @param {string} data.imageUrl
   * @param {string} [data.about]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createCharacter: async (
    { animeId, malId = null, name, role = 'Main', imageUrl, about = '' },
    client = null
  ) => {
    const sql = `
      INSERT INTO anime_characters (anime_id, mal_id, name, role, image_url, about)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [animeId, malId, name, role, imageUrl, about]);
    return rows[0];
  },

  // ===========================================================================
  // MÓDULO: CATEGORIAS TEMÁTICAS DO QUIZ
  // ===========================================================================

  /**
   * Retorna todas as categorias ativas do sistema com contagem de perguntas publicadas.
   * 
   * @param {boolean} [onlyActive=true]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findAllCategories: async (onlyActive = true, client = null) => {
    const sql = `
      SELECT 
        c.*,
        COUNT(q.id) FILTER (WHERE q.is_published = TRUE) AS active_questions_count
      FROM quiz_categories c
      LEFT JOIN quiz_questions q ON q.category_id = c.id
      WHERE ($1 = FALSE OR c.is_active = TRUE)
      GROUP BY c.id
      ORDER BY c.name ASC;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [onlyActive]);
    return rows;
  },

  /**
   * Localiza uma categoria pelo seu ID.
   * 
   * @param {number} id
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findCategoryById: async (id, client = null) => {
    const sql = `SELECT * FROM quiz_categories WHERE id = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza uma categoria pelo seu slug.
   * 
   * @param {string} slug
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findCategoryBySlug: async (slug, client = null) => {
    const sql = `SELECT * FROM quiz_categories WHERE slug = $1;`;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [slug]);
    return rows[0] || null;
  },

  /**
   * Cria uma nova categoria temática no catálogo do quiz.
   * 
   * @param {Object} data
   * @param {string} data.name
   * @param {string} data.slug
   * @param {string} [data.description]
   * @param {string} [data.iconName='sparkles']
   * @param {string} [data.colorHex='#00f2fe']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createCategory: async (
    { name, slug, description = '', iconName = 'sparkles', colorHex = '#00f2fe' },
    client = null
  ) => {
    const sql = `
      INSERT INTO quiz_categories (name, slug, description, icon_name, color_hex, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [name, slug, description, iconName, colorHex]);
    return rows[0];
  },

  /**
   * Actualiza dados de uma categoria existente.
   * 
   * @param {number} id
   * @param {Object} data
   * @param {string} data.name
   * @param {string} data.description
   * @param {string} data.iconName
   * @param {string} data.colorHex
   * @param {boolean} data.isActive
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  updateCategory: async (
    id,
    { name, description, iconName, colorHex, isActive },
    client = null
  ) => {
    const sql = `
      UPDATE quiz_categories
      SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        icon_name = COALESCE($4, icon_name),
        color_hex = COALESCE($5, color_hex),
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id, name, description, iconName, colorHex, isActive]);
    return rows[0] || null;
  },
};

export default animeRepository;