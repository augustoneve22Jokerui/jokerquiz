import { jikanService } from '../src/services/jikan.service.js';
import { animeRepository } from '../src/repositories/anime.repository.js';
import { closePool } from '../src/database/connection.js';
import { env } from '../src/config/environment.js';

/**
 * Script de diagnóstico e validação da integração com a Jikan API (MyAnimeList v4) e cache relacional.
 * Executado via `node scripts/test-jikan.js`.
 */
const runJikanTest = async () => {
  console.log('================================================================================');
  console.log(`[JIKAN TEST] A testar integração com a Jikan API (${env.JIKAN.baseUrl})...`);
  console.log('================================================================================');

  const startTime = Date.now();

  try {
    // -------------------------------------------------------------------------
    // 1. Teste de Busca Dinâmica por Termo
    // -------------------------------------------------------------------------
    const searchTerm = 'Attack on Titan';
    console.log(`[1/3] A pesquisar catálogo externo por: "${searchTerm}"...`);
    const searchStartTime = Date.now();
    const searchResults = await jikanService.searchAnime(searchTerm, 3);
    const searchDuration = Date.now() - searchStartTime;

    console.log(`[BUSCA] ✓ ${searchResults.length} animes encontrados e normalizados em ${searchDuration}ms.`);
    searchResults.forEach((anime, idx) => {
      console.log(`  ${idx + 1}. [MAL ID: ${anime.mal_id}] ${anime.title} (Score: ${anime.score})`);
    });

    // -------------------------------------------------------------------------
    // 2. Teste de Obtenção Directa por ID Oficial MyAnimeList
    // -------------------------------------------------------------------------
    const targetMalId = 16498; // Shingeki no Kyojin
    console.log('--------------------------------------------------------------------------------');
    console.log(`[2/3] A consultar metadados detalhados para mal_id=${targetMalId}...`);
    const fetchStartTime = Date.now();
    const anime = await jikanService.getAnimeByMalId(targetMalId);
    const fetchDuration = Date.now() - fetchStartTime;

    console.log(`[ANIME] ✓ Título: ${anime.title}`);
    console.log(`[ANIME] ✓ Slug: ${anime.slug}`);
    console.log(`[ANIME] ✓ Episódios: ${anime.episodes}`);
    console.log(`[ANIME] ✓ Géneros: ${Array.isArray(anime.genres) ? anime.genres.join(', ') : 'N/A'}`);
    console.log(`[ANIME] ✓ Imagem Capa: ${anime.image_url}`);
    console.log(`[TEMPO] Resposta obtida em ${fetchDuration}ms.`);

    // -------------------------------------------------------------------------
    // 3. Validação de Cache Local em PostgreSQL (Evita chamadas repetitivas)
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log(`[3/3] A verificar eficiência da cache no banco PostgreSQL Neon...`);
    const cacheStartTime = Date.now();
    const cachedAnime = await animeRepository.findByMalId(targetMalId);
    const cacheDuration = Date.now() - cacheStartTime;

    if (!cachedAnime) {
      throw new Error('Falha crítica: o anime não foi encontrado na cache local do PostgreSQL após a sincronização.');
    }

    console.log(`[CACHE LOCAL] ✓ Recuperado directamente do banco Neon em ${cacheDuration}ms.`);
    console.log(`[CACHE LOCAL] ID interno: ${cachedAnime.id} | Criado em: ${cachedAnime.created_at}`);

    // Consulta personagens sincronizados
    const characters = await animeRepository.findCharactersByAnimeId(cachedAnime.id);
    console.log(`[PERSONAGENS] ✓ Personagens persistidos na biblioteca: ${characters.length}`);
    characters.slice(0, 3).forEach((char, idx) => {
      console.log(`  - ${char.name} (${char.role})`);
    });

    const totalDuration = Date.now() - startTime;
    console.log('================================================================================');
    console.log(`[DIAGNÓSTICO] ✓ Integração Jikan API + Cache Neon validada com sucesso (${totalDuration}ms).`);
    console.log('================================================================================');

    process.exitCode = 0;
  } catch (error) {
    console.error('================================================================================');
    console.error('[ERRO JIKAN] Falha no teste de comunicação ou persistência:');
    console.error(error.message);
    if (error.stack) console.error(error.stack);
    console.error('================================================================================');
    process.exitCode = 1;
  } finally {
    await closePool();
  }
};

runJikanTest();