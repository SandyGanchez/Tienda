import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { extensionesImagen, generarPresignedUpload, s3Bucket, s3Region } from '../../config/s3';
import { tiendaUploadDir } from '../../middlewares/upload.middleware';
import { eliminarUploadControlado } from '../productos/productos.service';
import { texto, textoNullable, errorFuncional } from '../../utils/formatters';
import { toMarcaDto, toCategoriaDto, toSucursalDto, toSucursalPublicaDto } from '../../dtos/catalogo.dto';
import { catalogoRepository } from '../../db/repositories/catalogo.repository';
import { sucursalRepository } from '../../db/repositories/sucursal.repository';


export function validarSucursal(sucursal: any): string | null {
  if (!texto(sucursal.nombreSuc)) return 'El nombre de la sucursal es obligatorio';
  const limites: Record<string, number> = {
    nombreSuc: 100,
    descripcionSuc: 255,
    telefonoSuc: 15,
    correoSuc: 100,
    paginaWebSuc: 100,
    redSocialSuc: 100,
  };
  for (const [campo, limite] of Object.entries(limites)) {
    if (texto(sucursal[campo]).length > limite) {
      return `El campo ${campo} no puede superar ${limite} caracteres`;
    }
  }
  const correo = texto(sucursal.correoSuc);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return 'El correo no tiene un formato válido';
  }
  const paginaWeb = texto(sucursal.paginaWebSuc);
  if (paginaWeb) {
    try {
      const url = new URL(paginaWeb);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'La página web debe usar http o https';
      }
    } catch {
      return 'La página web no es una URL válida';
    }
  }
  return null;
}

export class CatalogosService {
  // MARCAS
  async listarMarcas() {
    if (process.env.DYNAMODB_TABLE) {
      const marcas = await catalogoRepository.listMarcas();
      return marcas.map(toMarcaDto);
    }
    const marcas = await prisma.marca.findMany({
      orderBy: { nombreMarca: 'asc' },
    });
    return marcas.map(toMarcaDto);
  }

  async crearMarca(nombre: string, descripcion?: string | null) {
    const nombreLimpio = texto(nombre);
    if (!nombreLimpio) {
      throw errorFuncional('El nombre de la marca es obligatorio', 400);
    }
    if (process.env.DYNAMODB_TABLE) {
      const marca = await catalogoRepository.createMarca({ nombreMarca: nombreLimpio, descripMarca: descripcion || undefined });
      return toMarcaDto(marca);
    }
    const marca = await prisma.marca.create({
      data: {
        nombreMarca: nombreLimpio,
        descripMarca: textoNullable(descripcion),
      },
    });
    return toMarcaDto(marca);
  }

  async actualizarMarca(idMarca: number, nombre: string, descripcion?: string | null) {
    const nombreLimpio = texto(nombre);
    if (!nombreLimpio) {
      throw errorFuncional('El nombre de la marca es obligatorio', 400);
    }
    if (process.env.DYNAMODB_TABLE) {
      const marca = await catalogoRepository.updateMarca(idMarca, { nombreMarca: nombreLimpio, descripMarca: descripcion || undefined });
      return toMarcaDto(marca);
    }
    const marca = await prisma.marca.update({
      where: { idMarca },
      data: {
        nombreMarca: nombreLimpio,
        descripMarca: textoNullable(descripcion),
      },
    });
    return toMarcaDto(marca);
  }

  async eliminarMarca(idMarca: number) {
    if (process.env.DYNAMODB_TABLE) {
      await catalogoRepository.deleteMarca(idMarca);
      return { message: 'Marca eliminada correctamente' };
    }
    const productos = await prisma.producto.count({ where: { idMarca } });
    if (productos > 0) {
      throw errorFuncional('No se puede eliminar la marca porque tiene productos asociados', 409);
    }
    await prisma.marca.delete({ where: { idMarca } });
    return { message: 'Marca eliminada correctamente' };
  }

  // CATEGORÍAS
  async listarCategorias() {
    if (process.env.DYNAMODB_TABLE) {
      const categorias = await catalogoRepository.listCategorias();
      return categorias.map(toCategoriaDto);
    }
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombreCat: 'asc' },
    });
    return categorias.map(toCategoriaDto);
  }

  async crearCategoria(nombre: string, descripcion?: string | null) {
    const nombreLimpio = texto(nombre);
    if (!nombreLimpio) {
      throw errorFuncional('El nombre de la categoría es obligatorio', 400);
    }
    if (process.env.DYNAMODB_TABLE) {
      const categoria = await catalogoRepository.createCategoria({ nombreCat: nombreLimpio, descripCat: descripcion || undefined });
      return toCategoriaDto(categoria);
    }
    const categoria = await prisma.categoria.create({
      data: {
        nombreCat: nombreLimpio,
        descripCat: textoNullable(descripcion),
      },
    });
    return toCategoriaDto(categoria);
  }

  async actualizarCategoria(idCat: number, nombre: string, descripcion?: string | null) {
    const nombreLimpio = texto(nombre);
    if (!nombreLimpio) {
      throw errorFuncional('El nombre de la categoría es obligatorio', 400);
    }
    if (process.env.DYNAMODB_TABLE) {
      const categoria = await catalogoRepository.updateCategoria(idCat, { nombreCat: nombreLimpio, descripCat: descripcion || undefined });
      return toCategoriaDto(categoria);
    }
    const categoria = await prisma.categoria.update({
      where: { idCat },
      data: {
        nombreCat: nombreLimpio,
        descripCat: textoNullable(descripcion),
      },
    });
    return toCategoriaDto(categoria);
  }

  async eliminarCategoria(idCat: number) {
    if (process.env.DYNAMODB_TABLE) {
      await catalogoRepository.deleteCategoria(idCat);
      return { message: 'Categoría eliminada correctamente' };
    }
    const productos = await prisma.producto.count({ where: { idCat } });
    if (productos > 0) {
      throw errorFuncional('No se puede eliminar la categoría porque tiene productos asociados', 409);
    }
    await prisma.categoria.delete({ where: { idCat } });
    return { message: 'Categoría eliminada correctamente' };
  }


  // SUCURSALES
  async obtenerSucursal(idSuc: number) {
    if (process.env.DYNAMODB_TABLE) {
      const s = await sucursalRepository.getById(idSuc);
      return toSucursalDto(s);
    }
    const s = await prisma.sucursal.findUnique({
      where: { idSuc },
      include: { direccion: true },
    });
    return toSucursalDto(s);
  }

  async listarSucursales() {
    if (process.env.DYNAMODB_TABLE) {
      const s = await sucursalRepository.getById(1);
      return s ? [toSucursalDto(s)] : [];
    }
    const sucursales = await prisma.sucursal.findMany({
      orderBy: [{ nombreSuc: 'asc' }, { idSuc: 'asc' }],
      include: { direccion: true },
    });
    return sucursales.map(toSucursalDto);
  }

  async crearSucursal(body: any) {
    const errorValidacion = validarSucursal(body);
    if (errorValidacion) {
      throw errorFuncional(errorValidacion, 400);
    }
    const nueva = await prisma.sucursal.create({
      data: {
        nombreSuc: texto(body.nombreSuc),
        descripcionSuc: textoNullable(body.descripcionSuc),
        telefonoSuc: textoNullable(body.telefonoSuc),
        correoSuc: textoNullable(body.correoSuc),
        paginaWebSuc: textoNullable(body.paginaWebSuc),
        redSocialSuc: textoNullable(body.redSocialSuc),
      },
    });
    return await this.obtenerSucursal(nueva.idSuc);
  }

  async actualizarSucursal(idSuc: number, body: any) {
    const errorValidacion = validarSucursal(body);
    if (errorValidacion) {
      throw errorFuncional(errorValidacion, 400);
    }
    await prisma.sucursal.update({
      where: { idSuc },
      data: {
        nombreSuc: texto(body.nombreSuc),
        descripcionSuc: textoNullable(body.descripcionSuc),
        telefonoSuc: textoNullable(body.telefonoSuc),
        correoSuc: textoNullable(body.correoSuc),
        paginaWebSuc: textoNullable(body.paginaWebSuc),
        redSocialSuc: textoNullable(body.redSocialSuc),
      },
    });
    return await this.obtenerSucursal(idSuc);
  }

  async presignLogo(idSuc: number, mimeType: string, nombreOriginal?: string) {
    const sucursal = await this.obtenerSucursal(idSuc);
    if (!sucursal) {
      throw errorFuncional('Sucursal no encontrada', 404);
    }
    const presigned = await generarPresignedUpload({
      folder: 'tienda',
      mimeType,
      nombreArchivoOriginal: nombreOriginal || undefined,
    });
    return { ...presigned, idSuc, expiresIn: 900 };
  }

  async confirmarLogo(idSuc: number, logoUrlInput: string) {
    const anterior = await this.obtenerSucursal(idSuc);
    if (!anterior) {
      throw errorFuncional('Sucursal no encontrada', 404);
    }

    const rutaFinal =
      logoUrlInput.startsWith('http://') || logoUrlInput.startsWith('https://') || logoUrlInput.startsWith('/uploads')
        ? logoUrlInput
        : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${logoUrlInput}`;

    if (process.env.DYNAMODB_TABLE) {
      await sucursalRepository.updateLogo(idSuc, rutaFinal);
    } else {
      await prisma.sucursal.update({ where: { idSuc }, data: { logoSuc: rutaFinal } });
    }

    if (anterior.logo && anterior.logo !== rutaFinal) {
      eliminarUploadControlado(anterior.logo, tiendaUploadDir, '/uploads/tienda/');
    }

    return await this.obtenerSucursal(idSuc);
  }

  async eliminarLogo(idSuc: number) {
    const anterior = await this.obtenerSucursal(idSuc);
    if (!anterior) {
      throw errorFuncional('Sucursal no encontrada', 404);
    }
    if (process.env.DYNAMODB_TABLE) {
      await sucursalRepository.updateLogo(idSuc, null);
    } else {
      await prisma.sucursal.update({ where: { idSuc }, data: { logoSuc: null } });
    }
    eliminarUploadControlado(anterior.logo, tiendaUploadDir, '/uploads/tienda/');
    return await this.obtenerSucursal(idSuc);
  }

  // CARGOS
  async listarCargos() {
    if (process.env.DYNAMODB_TABLE) {
      return await catalogoRepository.listCargos();
    }
    return await prisma.cargo.findMany({
      where: { nombreCargo: { in: ['ADMINISTRADOR', 'CAJERO'] } },
      orderBy: { nombreCargo: 'asc' },
    });
  }

  // TIENDA PÚBLICA
  async listarTiendaPublica() {
    if (process.env.DYNAMODB_TABLE) {
      const sucursales = await sucursalRepository.getPublic(1);
      return sucursales.map(toSucursalPublicaDto);
    }
    return await prisma.sucursal.findMany({
      orderBy: { idSuc: 'asc' },
      select: {
        idSuc: true,
        nombreSuc: true,
        descripcionSuc: true,
        logoSuc: true,
      },
    });
  }

}

export const catalogosService = new CatalogosService();



