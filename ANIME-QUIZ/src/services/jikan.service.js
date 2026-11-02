import { env } from '../config/environment.js';
import { animeRepository } from '../repositories/anime.repository.js';
import { logger } from '../utils/logger.util.js';

// Fila interna com controlo de cadência para respeitar o rate-limit da Jikan API (3 req/seg)
let lastRequestTimestamp = 0;

/**
 * Aguarda o tempo necessário para respeitar os intervalos mínimos entre requisições à Jikan API.
 * 
 * @param {number} delayMs
 * @returns {Promise<void>}
 */
const enforceRateLimit = async (delayMs = env.JIKAN.requestDelayMs) => {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;

  if (timeSinceLast < delayMs) {
    const waitTime = delayMs - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTimestamp = Date.now();
};

/**
 * Converte um título de anime numa string de slug amigável para URLs e identificação única.
 * 
 * @param {string} title
 * @returns {string}
 */
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
};

/**
 * Serviço de Integração com a Jikan API (MyAnimeList v4) e Cache Persistente em PostgreSQL.
 */
export const jikanService = {
  /**
   * Executa uma requisição HTTP segura à Jikan API com timeout, controle de rate-limit e retentativas.
   * 
   * @param {string} endpoint - Caminho relativo (ex: '/anime/1735')
   * @param {number} [retryCount=0]
   * @returns {Promise<any>}
   */
  fetchFromJikan: async (endpoint, retryCount = 0) => {
    await enforceRateLimit();

    const url = `${env.JIKAN.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s de timeout máximo

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': `${env.APP_NAME}/1.0 (Anime Quiz Gaming Platform)`,
        },
      });

      clearTimeout(timeoutId);

      // Tratamento específico de Rate Limit (HTTP 429 Too Many Requests)
      if (response.status === 429) {
        if (retryCount < 2) {
          logger.warn(`[JIKAN 429] Rate limit atingido em ${endpoint}. A aguardar 2 segundos para retentativa...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return await jikanService.fetchFromJikan(endpoint, retryCount + 1);
        }
        throw new Error('Limite de requisições da Jikan API excedido temporariamente.');
      }

      if (!response.ok) {
        throw new Error(`Jikan API retornou código de erro HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error(`[JIKAN FETCH ERROR] Falha na comunicação com endpoint ${endpoint}:`, error.message);
      throw error;
    }
  },

  /**
   * Obtém detalhes de um anime pelo ID oficial da MyAnimeList.
   * Consulta primeiro a cache relacional no PostgreSQL Neon; se não existir, consome a Jikan API e guarda.
   * 
   * @param {number} malId
   * @returns {Promise<Object>}
   */
  getAnimeByMalId: async (malId) => {
    // 1. Verifica cache local na tabela `animes`
    const cachedAnime = await animeRepository.findByMalId(malId);
    if (cachedAnime) {
      return cachedAnime;
    }

    // 2. Consulta a API pública da Jikan
    logger.info(`[JIKAN SYNC] A descarregar metadados do anime mal_id=${malId}...`);
    const data = await jikanService.fetchFromJikan(`/anime/${malId}`);

    if (!data) {
      throw new Error(`Anime mal_id=${malId} não foi encontrado na base de dados da MyAnimeList.`);
    }

    const title = data.title || data.title_english || 'Anime Desconhecido';
    const slug = generateSlug(title);
    const genres = Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [];
    const imageUrl = data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '/assets/images/placeholders/anime-cover.png';

    // 3. Persiste no PostgreSQL Neon para servir de cache permanente
    const savedAnime = await animeRepository.upsert({
      malId: data.mal_id,
      title,
      titleEnglish: data.title_english || null,
      titleJapanese: data.title_japanese || null,
      slug,
      synopsis: data.synopsis || '',
      imageUrl,
      bannerUrl: null,
      episodes: data.episodes || 0,
      score: data.score || 0.00,
      status: data.status || 'Finished Airing',
      genres,
    });

    // 4. Sincroniza personagens principais em background sem travar a requisição principal
    jikanService.syncAnimeCharacters(savedAnime.id, data.mal_id).catch((err) => {
      logger.warn(`[JIKAN SYNC WARN] Não foi possível sincronizar personagens para o anime ${title}:`, err.message);
    });

    return savedAnime;
  },

  /**
   * Realiza pesquisa de animes por termo de busca com cache automática dos resultados.
   * 
   * @param {string} queryText - Termo pesquisado
   * @param {number} [limit=10]
   * @returns {Promise<Array<Object>>}
   */
  searchAnime: async (queryText, limit = 10) => {
    if (!queryText || queryText.trim().length === 0) {
      return [];
    }

    const sanitizedQuery = encodeURIComponent(queryText.trim());
    const results = await jikanService.fetchFromJikan(`/anime?q=${sanitizedQuery}&limit=${limit}&order_by=popularity&sort=asc`);

    if (!Array.isArray(results)) {
      return [];
    }

    const savedAnimes = [];

    for (const item of results) {
      try {
        const title = item.title || item.title_english || 'Anime';
        const slug = generateSlug(title);
        const genres = Array.isArray(item.genres) ? item.genres.map((g) => g.name) : [];
        const imageUrl = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '/assets/images/placeholders/anime-cover.png';

        const animeRecord = await animeRepository.upsert({
          malId: item.mal_id,
          title,
          titleEnglish: item.title_english || null,
          titleJapanese: item.title_japanese || null,
          slug,
          synopsis: item.synopsis || '',
          imageUrl,
          bannerUrl: null,
          episodes: item.episodes || 0,
          score: item.score || 0.00,
          status: item.status || 'Finished Airing',
          genres,
        });

        savedAnimes.push(animeRecord);
      } catch (err) {
        logger.warn(`[JIKAN SYNC WARN] Falha ao persistir anime [${item.title}]:`, err.message);
      }
    }

    return savedAnimes;
  },

  /**
   * Sincroniza e armazena os personagens principais de um anime na tabela `anime_characters`.
   * 
   * @param {number} animeDbId - ID interno da tabela `animes`
   * @param {number} malId - ID oficial MyAnimeList
   * @returns {Promise<void>}
   */
  syncAnimeCharacters: async (animeDbId, malId) => {
    const charactersData = await jikanService.fetchFromJikan(`/anime/${malId}/characters`);

    if (!Array.isArray(charactersData)) {
      return;
    }

    // Filtra apenas personagens principais ou de suporte de topo (limita a 10 personagens)
    const topCharacters = charactersData
      .filter((c) => c.role === 'Main' || c.role === 'Supporting')
      .slice(0, 10);

    for (const item of topCharacters) {
      const char = item.character;
      const imageUrl = char.images?.jpg?.image_url || '/assets/images/placeholders/character.png';

      await animeRepository.createCharacter({
        animeId: animeDbId,
        malId: char.mal_id || null,
        name: char.name,
        role: item.role || 'Main',
        imageUrl,
        about: '',
      });
    }

    logger.info(`[JIKAN SYNC] ${topCharacters.length} personagens sincronizados para o anime_id=${animeDbId}`);
  },
};

export default jikanService;