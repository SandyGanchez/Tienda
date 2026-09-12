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
import { comprobantesUploadDir } from '../middlewares/upload.middleware';

/**
 * Contrato base para drivers de almacenamiento en la nube o local.
 */
export interface ICloudStorageDriver {
  generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult>;
  generarPresignedDownload(key: string, nombreArchivo?: string | null, mimeType?: string | null): Promise<string>;
  eliminarObjeto(rutaOKey: string): Promise<void>;
}

/**
 * Contrato unificado de almacenamiento que cumple con el Principio de Sustitución de Liskov (LSP).
 * Cualquier implementación (S3, Local, CloudFront, MinIO, Memoria para tests)
 * es completamente sustituible sin alterar la corrección del programa.
 */
export interface IStorageDriver extends ICloudStorageDriver {
  readonly tipo: string;
  puedeManejar(rutaOKey?: string | null): boolean;
  eliminar(rutaOKey: string, directorioLocal?: string, prefijoLocal?: string): Promise<void>;
}

/**
 * Supertipo abstracto que define el comportamiento común y garantiza invariantes LSP.
 */
export abstract class BaseStorageDriver implements IStorageDriver {
  abstract readonly tipo: string;

  abstract puedeManejar(rutaOKey?: string | null): boolean;

  abstract generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult>;

  abstract generarPresignedDownload(
    key: string,
    nombreArchivo?: string | null,
    mimeType?: string | null,
  ): Promise<string>;

  abstract eliminarObjeto(rutaOKey: string): Promise<void>;

  async eliminar(rutaOKey: string, directorioLocal?: string, prefijoLocal?: string): Promise<void> {
    await this.eliminarObjeto(rutaOKey);
  }
}

/**
 * Driver predeterminado para AWS S3 en arquitectura Serverless.
 * Totalmente sustituible bajo LSP.
 */
export class S3CloudStorageDriver extends BaseStorageDriver {
  readonly tipo = 'S3';

  override puedeManejar(rutaOKey?: string | null): boolean {
    return esUrlS3(rutaOKey);
  }

  async generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult> {
    return generarPresignedUpload(opciones);
  }

  async generarPresignedDownload(key: string, nombreArchivo?: string | null, mimeType?: string | null): Promise<string> {
    return generarPresignedDownload(key, nombreArchivo, mimeType);
  }

  async eliminarObjeto(rutaOKey: string): Promise<void> {
    return eliminarObjetoS3(rutaOKey);
  }

  override async eliminar(rutaOKey: string): Promise<void> {
    await this.eliminarObjeto(rutaOKey);
  }
}

/**
 * Driver para almacenamiento local en disco (desarrollo, pruebas y fallback).
 * Sustituye limpiamente a S3CloudStorageDriver bajo LSP sin romper el contrato.
 */
export class LocalStorageDriver extends BaseStorageDriver {
  readonly tipo = 'LOCAL';

  override puedeManejar(rutaOKey?: string | null): boolean {
    return !esUrlS3(rutaOKey);
  }

  async generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const ext = opciones.extensionOriginal || '.bin';
    const fileName = `${Date.now()}-${opciones.nombreArchivoOriginal || 'archivo'}${ext}`;
    const key = `${opciones.folder}/${fileName}`;
    return {
      uploadUrl: `/uploads/local/${key}`,
      key,
      publicUrl: `/uploads/local/${key}`,
      fileName,
    };
  }

  async generarPresignedDownload(key: string): Promise<string> {
    return `/uploads/local/${key}`;
  }

  async eliminarObjeto(rutaOKey: string): Promise<void> {
    await this.eliminar(rutaOKey);
  }

  override async eliminar(rutaOKey: string, directorioLocal?: string, prefijoLocal?: string): Promise<void> {
    if (!rutaOKey) return;
    if (directorioLocal && prefijoLocal && rutaOKey.startsWith(prefijoLocal)) {
      const nombre = path.basename(rutaOKey);
      const ruta = path.join(directorioLocal, nombre);
      if (path.dirname(ruta) === directorioLocal && fs.existsSync(ruta)) {
        fs.unlink(ruta, () => undefined);
      }
    }
  }
}

/**
 * StorageService: Responsabilidad única de gestionar almacenamiento de archivos.
 * Abierto a extensión (OCP) y respetando el Principio de Sustitución de Liskov (LSP):
 * cualquier driver que implemente IStorageDriver o ICloudStorageDriver puede ser inyectado.
 */
export class StorageService {
  private localDriver = new LocalStorageDriver();

  constructor(private cloudDriver: IStorageDriver = new S3CloudStorageDriver()) {}

  setCloudDriver(driver: ICloudStorageDriver): this {
    if ('puedeManejar' in driver && 'eliminar' in driver) {
      this.cloudDriver = driver as IStorageDriver;
    } else {
      // Adaptador para drivers que implementan la interfaz base ICloudStorageDriver
      this.cloudDriver = {
        tipo: 'CUSTOM',
        puedeManejar: (r) => esUrlS3(r),
        generarPresignedUpload: (opt) => driver.generarPresignedUpload(opt),
        generarPresignedDownload: (k, n, m) => driver.generarPresignedDownload(k, n, m),
        eliminarObjeto: (r) => driver.eliminarObjeto(r),
        eliminar: (r) => driver.eliminarObjeto(r),
      };
    }
    return this;
  }

  setDriver(driver: IStorageDriver): this {
    this.cloudDriver = driver;
    return this;
  }

  /**
   * Genera una URL prefirmada para subida directa.
   */
  async generarPresignedUpload(opciones: PresignedUploadOptions): Promise<PresignedUploadResult> {
    return this.cloudDriver.generarPresignedUpload(opciones);
  }

  /**
   * Genera una URL prefirmada para descarga/visualización temporal segura.
   */
  async generarPresignedDownload(key: string, nombreArchivo?: string | null, mimeType?: string | null): Promise<string> {
    return this.cloudDriver.generarPresignedDownload(key, nombreArchivo, mimeType);
  }

  /**
   * Elimina un archivo ya sea que resida en el almacenamiento cloud o local,
   * delegando al driver correspondiente según LSP.
   */
  async eliminarArchivo(
    rutaOKey?: string | null,
    directorioLocal?: string,
    prefijoLocal?: string,
  ): Promise<void> {
    if (!rutaOKey) return;

    if (this.cloudDriver.puedeManejar(rutaOKey)) {
      await this.cloudDriver.eliminar(rutaOKey, directorioLocal, prefijoLocal);
      return;
    }

    if (this.localDriver.puedeManejar(rutaOKey)) {
      await this.localDriver.eliminar(rutaOKey, directorioLocal, prefijoLocal);
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
