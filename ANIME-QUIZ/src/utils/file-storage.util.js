import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Calcula o hash SHA-256 de um ficheiro gravado em disco.
 * Fundamental para auditoria de comprovativos bancários em Angola,
 * assegurando que capturas de ecrã ou PDFs idênticos não sejam reenviados.
 * 
 * @param {string} filePath - Caminho absoluto ou relativo do ficheiro
 * @returns {Promise<string>} Hash hexadecimal de 64 caracteres
 */
export const calculateFileSha256 = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);

    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

/**
 * Remove um ficheiro de forma segura e silenciosa caso o mesmo exista.
 * Não lança erro se o ficheiro já não for encontrado em disco (ENOENT).
 * 
 * @param {string} filePath - Caminho do ficheiro a remover
 * @returns {Promise<boolean>} Verdadeiro se foi removido, falso caso não existisse
 */
export const deleteFileIfExists = async (filePath) => {
  try {
    if (!filePath) return false;
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // Ficheiro já não existia
    }
    console.error(`[FILE STORAGE WARN] Falha ao eliminar ficheiro [${filePath}]:`, error.message);
    return false;
  }
};

/**
 * Garante que um directório exista em disco de forma recursiva.
 * 
 * @param {string} dirPath - Caminho da pasta
 * @returns {Promise<void>}
 */
export const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Valida e resolve um caminho de ficheiro contra ataques de Directory Traversal (ex: ../../etc/passwd).
 * Garante que o ficheiro resolvido resida obrigatoriamente dentro do directório base autorizado.
 * 
 * @param {string} baseDirectory - Directório base seguro (ex: storage/uploads/proofs)
 * @param {string} requestedFilename - Nome do ficheiro solicitado
 * @returns {string} Caminho absoluto verificado
 * @throws {Error} Se o caminho tentar escapar à directoria base
 */
export const getSafeFilePath = (baseDirectory, requestedFilename) => {
  const safeBase = path.resolve(baseDirectory);
  const targetPath = path.resolve(safeBase, path.basename(requestedFilename));

  if (!targetPath.startsWith(safeBase)) {
    throw new Error('Tentativa de acesso ilegal a caminho fora da directoria autorizada (Directory Traversal detectado).');
  }

  return targetPath;
};

/**
 * Move um ficheiro de um caminho para outro com compatibilidade entre diferentes sistemas
 * de ficheiros ou partições de montagem no Render e em contentores Docker.
 * 
 * @param {string} sourcePath - Origem
 * @param {string} destinationPath - Destino
 * @returns {Promise<void>}
 */
export const moveFile = async (sourcePath, destinationPath) => {
  const destDir = path.dirname(destinationPath);
  await ensureDirectoryExists(destDir);

  try {
    // Tenta renomeação atómica rápida dentro da mesma partição
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      // Caso estejam em discos/pontos de montagem distintos, copia e remove o original
      await fs.copyFile(sourcePath, destinationPath);
      await fs.unlink(sourcePath);
    } else {
      throw error;
    }
  }
};

export default {
  calculateFileSha256,
  deleteFileIfExists,
  ensureDirectoryExists,
  getSafeFilePath,
  moveFile,
};