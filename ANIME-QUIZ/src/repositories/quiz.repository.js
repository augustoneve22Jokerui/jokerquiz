import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados do Motor de Quiz (Perguntas, Respostas, Sessões e Resultados).
 * Implementa queries SQL parametrizadas garantindo isolamento anti-cheat:
 * as respostas correctas nunca são expostas em consultas voltadas ao jogador.
 */
export const quizRepository = {
  // ===========================================================================
  // MÓDULO: PERGUNTAS E ALTERNATIVAS
  // ===========================================================================

  /**
   * Obtém um conjunto aleatório de perguntas para uma sessão de jogo.
   * Oculta a coluna `is_correct` das alternativas para prevenir inspecção no frontend.
   * 
   * @param {Object} options
   * @param {string} options.difficulty - 'INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'
   * @param {number} [options.categoryId]
   * @param {number} [options.animeId]
   * @param {number} [options.limit=10]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<Object>>}
   */
  findRandomQuestions: async (
    { difficulty, categoryId = null, animeId = null, limit = 10 },
    client = null
  ) => {
    const sql = `
      SELECT 
        q.id,
        q.category_id,
        q.anime_id,
        q.question_text,
        q.image_url,
        q.difficulty,
        q.time_limit_seconds,
        q.base_points,
        q.base_xp,
        c.name AS category_name,
        a.title AS anime_title,
        (
          SELECT json_agg(
            json_build_object(
              'id', ans.id,
              'text', ans.answer_text,
              'order', ans.display_order
            ) ORDER BY ans.display_order ASC
          )
          FROM quiz_answers ans
          WHERE ans.question_id = q.id
        ) AS options
      FROM quiz_questions q
      INNER JOIN quiz_categories c ON c.id = q.category_id
      LEFT JOIN animes a ON a.id = q.anime_id
      WHERE q.is_published = TRUE
        AND q.difficulty = $1
        AND ($2::INT IS NULL OR q.category_id = $2)
        AND ($3::INT IS NULL OR q.anime_id = $3)
      ORDER BY RANDOM()
      LIMIT $4;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [difficulty, categoryId, animeId, limit]);
    return rows;
  },

  /**
   * Localiza uma pergunta específica com as alternativas completas,
   * incluindo o gabarito oficial (`is_correct`) para avaliação interna no servidor.
   * 
   * @param {number} questionId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findQuestionWithAnswers: async (questionId, client = null) => {
    const sql = `
      SELECT 
        q.*,
        c.name AS category_name,
        a.title AS anime_title,
        (
          SELECT json_agg(
            json_build_object(
              'id', ans.id,
              'text', ans.answer_text,
              'isCorrect', ans.is_correct,
              'order', ans.display_order
            ) ORDER BY ans.display_order ASC
          )
          FROM quiz_answers ans
          WHERE ans.question_id = q.id
        ) AS answers
      FROM quiz_questions q
      INNER JOIN quiz_categories c ON c.id = q.category_id
      LEFT JOIN animes a ON a.id = q.anime_id
      WHERE q.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [questionId]);
    return rows[0] || null;
  },

  /**
   * Verifica no banco de dados se a alternativa enviada pelo utilizador é de facto a correcta.
   * 
   * @param {number} questionId
   * @param {number} answerId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  verifyAnswer: async (questionId, answerId, client = null) => {
    const sql = `
      SELECT is_correct 
      FROM quiz_answers 
      WHERE question_id = $1 AND id = $2;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [questionId, answerId]);
    return rows.length > 0 ? Boolean(rows[0].is_correct) : false;
  },

  /**
   * Cria uma nova pergunta e as suas 4 alternativas dentro de uma transacção.
   * 
   * @param {Object} questionData
   * @param {Array<{ text: string, isCorrect: boolean, order: number }>} answersData
   * @param {import('pg').PoolClient} client - Obrigatório para garantir atomicidade
   * @returns {Promise<Object>} Pergunta criada
   */
  createQuestionWithAnswers: async (questionData, answersData, client) => {
    const questionSql = `
      INSERT INTO quiz_questions (
        category_id,
        anime_id,
        question_text,
        image_url,
        difficulty,
        explanation,
        time_limit_seconds,
        base_points,
        base_xp,
        is_published,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
      RETURNING *;
    `;
    const { rows: questionRows } = await client.query(questionSql, [
      questionData.categoryId,
      questionData.animeId || null,
      questionData.questionText,
      questionData.imageUrl || null,
      questionData.difficulty,
      questionData.explanation || '',
      questionData.timeLimitSeconds || 15,
      questionData.basePoints || 100,
      questionData.baseXp || 25,
      questionData.createdBy || null,
    ]);

    const createdQuestion = questionRows[0];

    const answerSql = `
      INSERT INTO quiz_answers (question_id, answer_text, is_correct, display_order)
      VALUES ($1, $2, $3, $4);
    `;

    for (const ans of answersData) {
      await client.query(answerSql, [
        createdQuestion.id,
        ans.text,
        Boolean(ans.isCorrect),
        ans.order,
      ]);
    }

    return createdQuestion;
  },

  /**
   * Lista perguntas com paginação, filtros e ordenação para o painel administrativo.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {string} [options.difficulty]
   * @param {number} [options.categoryId]
   * @param {string} [options.search='']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ questions: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findQuestionsPaginated: async (
    { page = 1, limit = 15, difficulty = null, categoryId = null, search = '' },
    client = null
  ) => {
    const offset = (page - 1) * limit;
    const searchTerm = `%${search.trim().toLowerCase()}%`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM quiz_questions q
      WHERE ($1::quiz_difficulty_enum IS NULL OR q.difficulty = $1)
        AND ($2::INT IS NULL OR q.category_id = $2)
        AND ($3 = '%%' OR LOWER(q.question_text) LIKE $3);
    `;

    const dataSql = `
      SELECT 
        q.*,
        c.name AS category_name,
        a.title AS anime_title
      FROM quiz_questions q
      INNER JOIN quiz_categories c ON c.id = q.category_id
      LEFT JOIN animes a ON a.id = q.anime_id
      WHERE ($1::quiz_difficulty_enum IS NULL OR q.difficulty = $1)
        AND ($2::INT IS NULL OR q.category_id = $2)
        AND ($3 = '%%' OR LOWER(q.question_text) LIKE $3)
      ORDER BY q.created_at DESC
      LIMIT $4 OFFSET $5;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [difficulty, categoryId, searchTerm]),
      executor(dataSql, [difficulty, categoryId, searchTerm, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      questions: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },

  // ===========================================================================
  // MÓDULO: SESSÕES DE QUIZ INDIVIDUAL
  // ===========================================================================

  /**
   * Cria uma sessão de quiz individual para o jogador.
   * 
   * @param {Object} sessionData
   * @param {string} sessionData.userId - UUID
   * @param {string} sessionData.mode - 'TREINO' ou 'RANQUEADO'
   * @param {string} sessionData.difficulty
   * @param {number} [sessionData.categoryId]
   * @param {number} [sessionData.totalQuestions=10]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createSession: async (
    { userId, mode, difficulty, categoryId = null, totalQuestions = 10 },
    client = null
  ) => {
    const sql = `
      INSERT INTO quiz_sessions (
        user_id,
        mode,
        difficulty,
        category_id,
        total_questions,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS')
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      userId,
      mode,
      difficulty,
      categoryId,
      totalQuestions,
    ]);
    return rows[0];
  },

  /**
   * Localiza uma sessão de quiz pelo seu ID primário.
   * 
   * @param {string} sessionId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findSessionById: async (sessionId, client = null) => {
    const sql = `
      SELECT 
        s.*,
        c.name AS category_name
      FROM quiz_sessions s
      LEFT JOIN quiz_categories c ON c.id = s.category_id
      WHERE s.id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [sessionId]);
    return rows[0] || null;
  },

  /**
   * Regista a resposta dada a uma pergunta dentro de uma sessão.
   * 
   * @param {Object} data
   * @param {string} data.sessionId - UUID
   * @param {number} data.questionId
   * @param {number|null} data.selectedAnswerId
   * @param {boolean} data.isCorrect
   * @param {number} data.responseTimeMs
   * @param {number} data.pointsAwarded
   * @param {number} data.xpAwarded
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  recordSessionAnswer: async (
    {
      sessionId,
      questionId,
      selectedAnswerId,
      isCorrect,
      responseTimeMs,
      pointsAwarded,
      xpAwarded,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO quiz_session_answers (
        session_id,
        question_id,
        selected_answer_id,
        is_correct,
        response_time_ms,
        points_awarded,
        xp_awarded
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      sessionId,
      questionId,
      selectedAnswerId,
      isCorrect,
      responseTimeMs,
      pointsAwarded,
      xpAwarded,
    ]);
    return rows[0];
  },

  /**
   * Avança o índice da pergunta actual na sessão.
   * 
   * @param {string} sessionId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<number>} Novo índice
   */
  incrementSessionQuestionIndex: async (sessionId, client = null) => {
    const sql = `
      UPDATE quiz_sessions
      SET current_question_index = current_question_index + 1
      WHERE id = $1
      RETURNING current_question_index;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [sessionId]);
    return rows[0]?.current_question_index ?? 0;
  },

  /**
   * Finaliza uma sessão de quiz e actualiza o seu estado.
   * 
   * @param {string} sessionId - UUID
   * @param {'COMPLETED' | 'ABANDONED' | 'TIMED_OUT'} status
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  completeSession: async (sessionId, status = 'COMPLETED', client = null) => {
    const sql = `
      UPDATE quiz_sessions
      SET 
        status = $2,
        completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [sessionId, status]);
    return rows[0] || null;
  },

  // ===========================================================================
  // MÓDULO: RESULTADOS CONSOLIDADOS E HISTÓRICO
  // ===========================================================================

  /**
   * Cria o registo oficial de resultado final consolidado da sessão.
   * 
   * @param {Object} data
   * @param {string} data.sessionId - UUID
   * @param {string} data.userId - UUID
   * @param {number} data.correctAnswers
   * @param {number} data.incorrectAnswers
   * @param {number} data.unanswered
   * @param {number} data.accuracyPercentage
   * @param {number} data.totalScore
   * @param {number} data.totalXp
   * @param {number} data.timeSpentSeconds
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>}
   */
  createQuizResult: async (
    {
      sessionId,
      userId,
      correctAnswers,
      incorrectAnswers,
      unanswered,
      accuracyPercentage,
      totalScore,
      totalXp,
      timeSpentSeconds,
    },
    client = null
  ) => {
    const sql = `
      INSERT INTO quiz_results (
        session_id,
        user_id,
        correct_answers,
        incorrect_answers,
        unanswered,
        accuracy_percentage,
        total_score,
        total_xp,
        time_spent_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [
      sessionId,
      userId,
      correctAnswers,
      incorrectAnswers,
      unanswered,
      accuracyPercentage,
      totalScore,
      totalXp,
      timeSpentSeconds,
    ]);
    return rows[0];
  },

  /**
   * Localiza o resultado consolidado de uma sessão com dados do jogador.
   * 
   * @param {string} sessionId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findResultBySessionId: async (sessionId, client = null) => {
    const sql = `
      SELECT 
        r.*,
        s.mode,
        s.difficulty,
        s.total_questions,
        c.name AS category_name,
        p.display_name,
        p.avatar_url,
        p.rank_tier
      FROM quiz_results r
      INNER JOIN quiz_sessions s ON s.id = r.session_id
      LEFT JOIN quiz_categories c ON c.id = s.category_id
      INNER JOIN user_profiles p ON p.user_id = r.user_id
      WHERE r.session_id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [sessionId]);
    return rows[0] || null;
  },

  /**
   * Consulta o histórico paginado de partidas de um utilizador.
   * 
   * @param {string} userId - UUID
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=10]
   * @param {string} [options.mode]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ history: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findUserHistoryPaginated: async (
    userId,
    { page = 1, limit = 10, mode = null },
    client = null
  ) => {
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM quiz_results r
      INNER JOIN quiz_sessions s ON s.id = r.session_id
      WHERE r.user_id = $1
        AND ($2::quiz_mode_enum IS NULL OR s.mode = $2);
    `;

    const dataSql = `
      SELECT 
        r.*,
        s.mode,
        s.difficulty,
        s.total_questions,
        s.completed_at,
        c.name AS category_name
      FROM quiz_results r
      INNER JOIN quiz_sessions s ON s.id = r.session_id
      LEFT JOIN quiz_categories c ON c.id = s.category_id
      WHERE r.user_id = $1
        AND ($2::quiz_mode_enum IS NULL OR s.mode = $2)
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [userId, mode]),
      executor(dataSql, [userId, mode, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      history: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },
};

export default quizRepository;