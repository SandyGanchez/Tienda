import fs from 'fs';
import path from 'path';
import {
  eliminarObjetoS3,
  esUrlS3,
  extraerKeyS3,
  generarPresignedDownload,
  generarPresignedUpload,
  limpiarNombreArchivo,
  extensionesComprobante,
  extensionesImagen,
  PresignedUploadOptions,
  PresignedUploadResult,
} from '../config/s3';
import { comprobantesUploadDir, productosUploadDir, tiendaUploadDir } from '../middlewares/upload.middleware';

/**
 * StorageService: Responsabilidad única de gestionar almacenamiento de archivos,
 * tanto en AWS S3 (modo Serverless) como en el sistema de archivos local (modo desarrollo).
 */
export class StorageService {
  /**
   * Genera una URL prefirmada para subida directa a AWS S3.
   */
  async generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult> {
    return generarPresignedUpload(opciones);
  }

  /**
   * Genera una URL prefirmada para descarga/visualización temporal segura desde AWS S3.
   */
  async generarPresignedDownload(key: string, nombreArchivo?: string | null, mimeType?: string | null): Promise<string> {
    return generarPresignedDownload(key, nombreArchivo, mimeType);
  }

  /**
   * Elimina un archivo ya sea que resida en AWS S3 o en el almacenamiento local.
   */
  async eliminarArchivo(
    rutaOKey?: string | null,
    directorioLocal?: string,
    prefijoLocal?: string,
  ): Promise<void> {
    if (!rutaOKey) return;

    if (esUrlS3(rutaOKey)) {
      await eliminarObjetoS3(rutaOKey);
      return;
    }

    if (directorioLocal && prefijoLocal && rutaOKey.startsWith(prefijoLocal)) {
      const nombre = path.basename(rutaOKey);
      const ruta = path.join(directorioLocal, nombre);
      if (path.dirname(ruta) === directorioLocal && fs.existsSync(ruta)) {
        fs.unlink(ruta, () => undefined);
      }
    }
  }

  /**
   * Resuelve y valida una ruta local de comprobante asegurando que no haya Path Traversal.
   */
  resolverComprobantePrivado(nombreFisico?: string | null): string | null {
    if (!nombreFisico || path.basename(nombreFisico) !== nombreFisico) return null;
    const raiz = path.resolve(comprobantesUploadDir);
    const ruta = path.resolve(raiz, nombreFisico);
    const relativa = path.relative(raiz, ruta);
    if (!relativa || relativa.startsWith('..') || path.isAbsolute(relativa) || !fs.existsSync(ruta)) return null;
    return ruta;
  }

  /**
   * Inspecciona los magic bytes del archivo físico para verificar su MIME real de forma segura.
   */
  detectarMimeReal(rutaArchivo: string): string | null {
    try {
      const descriptor = fs.openSync(rutaArchivo, 'r');
      try {
        const buffer = Buffer.alloc(12);
        const leidos = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
        if (leidos >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
        if (leidos >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
          return 'image/png';
        if (leidos >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')
          return 'image/webp';
        if (leidos >= 5 && buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
        return null;
      } finally {
        fs.closeSync(descriptor);
      }
    } catch {
      return null;
    }
  }

  esS3(ruta?: string | null): boolean {
    return esUrlS3(ruta);
  }

  extraerKey(ruta?: string | null): string | null {
    return extraerKeyS3(ruta);
  }

  sanitizarNombre(nombre?: string | null, fallback = 'archivo'): string {
    return limpiarNombreArchivo(nombre, fallback);
  }

  esMimePermitidoImagen(mimeType: string): boolean {
    return extensionesImagen.has(mimeType);
  }

  esMimePermitidoComprobante(mimeType: string): boolean {
    return extensionesComprobante.has(mimeType);
  }
}

export const storageService = new StorageService();
