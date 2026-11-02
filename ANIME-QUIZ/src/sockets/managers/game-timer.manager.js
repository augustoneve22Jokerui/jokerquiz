/**
 * Gestor Autoritativo de Cronómetros de Jogo em Memória.
 * Centraliza a contagem oficial de tempo das perguntas em salas multiplayer e torneios.
 * Impede manipulações do relógio no cliente e garante a sincronização precisa entre todos os competidores.
 */
class GameTimerManager {
  constructor() {
    /**
     * Mapa de cronómetros activos indexados por identificador de sala (roomId).
     * @type {Map<string, { intervalId: NodeJS.Timeout, endTime: number, durationSeconds: number }>}
     */
    this.activeTimers = new Map();
  }

  /**
   * Inicia um cronómetro autoritativo no servidor para uma sala específica.
   * 
   * @param {string} roomId - Identificador da sala
   * @param {number} durationSeconds - Duração total da pergunta em segundos
   * @param {(remainingSeconds: number) => void} onTick - Callback invocado a cada segundo decorrido
   * @param {() => void} onExpire - Callback invocado quando o tempo esgotar formalmente
   */
  startTimer(roomId, durationSeconds, onTick, onExpire) {
    // Interrompe qualquer cronómetro anterior activo para esta sala
    this.stopTimer(roomId);

    const now = Date.now();
    const durationMs = durationSeconds * 1000;
    const endTime = now + durationMs;

    const intervalId = setInterval(() => {
      const remainingMs = Math.max(0, endTime - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      if (remainingSeconds > 0) {
        if (typeof onTick === 'function') {
          onTick(remainingSeconds);
        }
      } else {
        // Tempo expirado no servidor
        this.stopTimer(roomId);
        if (typeof onExpire === 'function') {
          onExpire();
        }
      }
    }, 1000);

    this.activeTimers.set(roomId, {
      intervalId,
      endTime,
      durationSeconds,
    });
  }

  /**
   * Interrompe e descarta o cronómetro de uma sala.
   * 
   * @param {string} roomId
   */
  stopTimer(roomId) {
    if (this.activeTimers.has(roomId)) {
      const timer = this.activeTimers.get(roomId);
      clearInterval(timer.intervalId);
      this.activeTimers.delete(roomId);
    }
  }

  /**
   * Retorna os segundos restantes oficiais calculados pelo relógio do servidor.
   * 
   * @param {string} roomId
   * @returns {number} Segundos restantes (0 se expirado ou inexistente)
   */
  getRemainingSeconds(roomId) {
    if (!this.activeTimers.has(roomId)) {
      return 0;
    }
    const { endTime } = this.activeTimers.get(roomId);
    const diffMs = endTime - Date.now();
    return Math.max(0, Math.ceil(diffMs / 1000));
  }

  /**
   * Verifica se existe um cronómetro em contagem para a sala.
   * 
   * @param {string} roomId
   * @returns {boolean}
   */
  isTimerActive(roomId) {
    return this.activeTimers.has(roomId);
  }

  /**
   * Encerra todos os cronómetros activos durante o encerramento gracioso do servidor.
   */
  clearAll() {
    for (const [roomId, timer] of this.activeTimers.entries()) {
      clearInterval(timer.intervalId);
    }
    this.activeTimers.clear();
  }
}

// Exporta instância única global (Singleton)
export const gameTimerManager = new GameTimerManager();
export default gameTimerManager;