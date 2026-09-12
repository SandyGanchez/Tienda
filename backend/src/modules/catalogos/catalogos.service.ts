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
  const nombre = texto(sucursal.nombreSuc || sucursal.nombre);
  if (!nombre) return 'El nombre de la sucursal es obligatorio';
  const limites: Record<string, number> = {
    nombreSuc: 100,
    descripcionSuc: 255,
    telefonoSuc: 15,
    correoSuc: 100,
    paginaWebSuc: 100,
    redSocialSuc: 100,
  };
  const mapeados: Record<string, any> = {
    nombreSuc: sucursal.nombreSuc || sucursal.nombre,
    descripcionSuc: sucursal.descripcionSuc ?? sucursal.descripcion,
    telefonoSuc: sucursal.telefonoSuc ?? sucursal.telefono,
    correoSuc: sucursal.correoSuc ?? sucursal.correo,
    paginaWebSuc: sucursal.paginaWebSuc ?? sucursal.paginaWeb,
    redSocialSuc: sucursal.redSocialSuc ?? sucursal.redSocial,
  };
  for (const [campo, limite] of Object.entries(limites)) {
    if (texto(mapeados[campo]).length > limite) {
      return `El campo ${campo} no puede superar ${limite} caracteres`;
    }
  }
  const correo = texto(mapeados.correoSuc);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return 'El correo no tiene un formato válido';
  }
  const paginaWeb = texto(mapeados.paginaWebSuc);
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
    const datosNormalizados = {
      nombreSuc: texto(body.nombreSuc || body.nombre),
      descripcionSuc: textoNullable(body.descripcionSuc ?? body.descripcion),
      telefonoSuc: textoNullable(body.telefonoSuc ?? body.telefono),
      correoSuc: textoNullable(body.correoSuc ?? body.correo),
      paginaWebSuc: textoNullable(body.paginaWebSuc ?? body.paginaWeb),
      redSocialSuc: textoNullable(body.redSocialSuc ?? body.redSocial),
    };
    if (process.env.DYNAMODB_TABLE) {
      const creada = await sucursalRepository.create(datosNormalizados);
      return toSucursalDto(creada);
    }
    const nueva = await prisma.sucursal.create({
      data: datosNormalizados,
    });
    return await this.obtenerSucursal(nueva.idSuc);
  }

  async actualizarSucursal(idSuc: number, body: any) {
    const errorValidacion = validarSucursal(body);
    if (errorValidacion) {
      throw errorFuncional(errorValidacion, 400);
    }
    const datosNormalizados = {
      nombreSuc: texto(body.nombreSuc || body.nombre),
      descripcionSuc: textoNullable(body.descripcionSuc ?? body.descripcion),
      telefonoSuc: textoNullable(body.telefonoSuc ?? body.telefono),
      correoSuc: textoNullable(body.correoSuc ?? body.correo),
      paginaWebSuc: textoNullable(body.paginaWebSuc ?? body.paginaWeb),
      redSocialSuc: textoNullable(body.redSocialSuc ?? body.redSocial),
    };
    if (process.env.DYNAMODB_TABLE) {
      await sucursalRepository.update(idSuc, datosNormalizados);
      return await this.obtenerSucursal(idSuc);
    }
    await prisma.sucursal.update({
      where: { idSuc },
      data: datosNormalizados,
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
      return sucursales.map(toSucursalPublicaDto).filter(Boolean);
    }
    const sucursales = await prisma.sucursal.findMany({
      orderBy: { idSuc: 'asc' },
      select: {
        idSuc: true,
        nombreSuc: true,
        descripcionSuc: true,
        logoSuc: true,
      },
    });
    return sucursales.map(toSucursalPublicaDto).filter(Boolean);
  }

}

export const catalogosService = new CatalogosService();



