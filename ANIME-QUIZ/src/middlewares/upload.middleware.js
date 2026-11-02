import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/environment.js';
import { AppError } from './error.middleware.js';

// Assegura a criação dos directórios de armazenamento privado e temporário
const avatarsDir = path.resolve(env.STORAGE.uploadBaseDir, 'avatars');
const proofsDir = path.resolve(env.STORAGE.uploadBaseDir, 'proofs');
const tempDir = path.resolve(env.STORAGE.tempDir);

[avatarsDir, proofsDir, tempDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Cria uma estratégia de armazenamento em disco com nomes de ficheiro ofuscados via UUIDv4.
 * Impede sobreposição de ficheiros, ataques de directory traversal e execução directa.
 * 
 * @param {string} destinationDirectory - Caminho absoluto da pasta de destino
 */
const createDiskStorage = (destinationDirectory) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationDirectory);
    },
    filename: (req, file, cb) => {
      const uniqueId = crypto.randomUUID();
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${uniqueId}${extension}`);
    },
  });
};

/**
 * Filtro de validação de MIME types para avatares (apenas imagens standard).
 */
const avatarFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Formato de avatar inválido. Apenas imagens JPEG, PNG e WEBP são aceites.',
        400,
        'INVALID_AVATAR_FORMAT'
      ),
      false
    );
  }
};

/**
 * Filtro de validação de MIME types para comprovativos bancários em Angola.
 * Aceita imagens (capturas Multicaixa Express) e documentos PDF de transferências.
 */
const proofFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Formato de comprovativo não suportado. Envie um ficheiro PDF ou imagem (JPEG, PNG, WEBP).',
        400,
        'INVALID_PROOF_FORMAT'
      ),
      false
    );
  }
};

/**
 * Instância do Multer para upload de avatares (limite rígido de 2MB).
 */
const avatarUpload = multer({
  storage: createDiskStorage(avatarsDir),
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 Megabytes
    files: 1,
  },
});

/**
 * Instância do Multer para upload de comprovativos bancários (limite padrão de 5MB).
 */
const proofUpload = multer({
  storage: createDiskStorage(proofsDir),
  fileFilter: proofFileFilter,
  limits: {
    fileSize: env.STORAGE.maxFileSizeBytes, // 5 Megabytes
    files: 1,
  },
});

/**
 * Middleware de invólucro para captura segura de erros de upload de avatar.
 * 
 * @param {string} [fieldName='avatar']
 * @returns {import('express').RequestHandler}
 */
export const handleAvatarUpload = (fieldName = 'avatar') => {
  return (req, res, next) => {
    const uploadSingle = avatarUpload.single(fieldName);

    uploadSingle(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('A imagem do avatar não pode exceder 2MB.', 400, 'AVATAR_TOO_LARGE'));
        }
        return next(new AppError(`Erro no upload do avatar: ${err.message}`, 400, 'UPLOAD_ERROR'));
      }

      return next(err);
    });
  };
};

/**
 * Middleware de invólucro para captura segura de erros de upload de comprovativos.
 * 
 * @param {string} [fieldName='proof']
 * @returns {import('express').RequestHandler}
 */
export const handlePaymentProofUpload = (fieldName = 'proof') => {
  return (req, res, next) => {
    const uploadSingle = proofUpload.single(fieldName);

    uploadSingle(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              `O comprovativo excede o limite máximo permitido de ${env.STORAGE.maxFileSizeBytes / (1024 * 1024)}MB.`,
              400,
              'PROOF_TOO_LARGE'
            )
          );
        }
        return next(new AppError(`Erro no envio do comprovativo: ${err.message}`, 400, 'UPLOAD_ERROR'));
      }

      return next(err);
    });
  };
};

export default {
  handleAvatarUpload,
  handlePaymentProofUpload,
};