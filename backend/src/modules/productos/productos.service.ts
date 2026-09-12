import fs from 'fs';
import path from 'path';
import { prisma, DbClient } from '../../config/prisma';
import { env } from '../../config/env';
import { productosUploadDir } from '../../middlewares/upload.middleware';
import { idValido, texto, textoNullable, errorFuncional } from '../../utils/formatters';
import { toProductoDto, toProductoListDto } from '../../dtos/producto.dto';
import { productoRepository } from '../../db/repositories/producto.repository';
import { storageService } from '../../services/storage.service';
import { CompositeProductLookupProvider, defaultProductLookupProvider } from './product-lookup.provider';


export function validarProducto(producto: any): string | null {
  if (!texto(producto.nombre)) return 'El nombre del producto es obligatorio';
  const precio = producto.precio !== undefined ? producto.precio : producto.precioVenta;
  if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
    return 'El precio de venta debe ser un número mayor o igual a cero';
  }
  if (!Number.isInteger(Number(producto.existencia)) || Number(producto.existencia) < 0) {
    return 'La existencia debe ser un entero mayor o igual a cero';
  }
  if (
    producto.costo !== null &&
    producto.costo !== undefined &&
    producto.costo !== '' &&
    (!Number.isFinite(Number(producto.costo)) || Number(producto.costo) < 0)
  ) {
    return 'El costo debe ser un número mayor o igual a cero';
  }
  if (
    producto.stockMinimo !== null &&
    producto.stockMinimo !== undefined &&
    producto.stockMinimo !== '' &&
    (!Number.isInteger(Number(producto.stockMinimo)) || Number(producto.stockMinimo) < 0)
  ) {
    return 'El stock mínimo debe ser un entero mayor o igual a cero';
  }
  if (!idValido(producto.idMarca)) return 'Selecciona una marca válida';
  if (!idValido(producto.idCat)) return 'Selecciona una categoría válida';
  return null;
}

export function eliminarUploadControlado(
  rutaPublica?: string | null,
  directorio = productosUploadDir,
  prefijo = '/uploads/productos/',
): void {
  void storageService.eliminarArchivo(rutaPublica, directorio, prefijo);
}

export class ProductosService {
  constructor(private lookupProvider: CompositeProductLookupProvider = defaultProductLookupProvider) {}

  async obtenerProducto(idPro: number, client: DbClient = prisma) {
    if (process.env.DYNAMODB_TABLE) {
      const p = await productoRepository.getProductoById(idPro);
      if (!p) return null;
      return toProductoDto(p);
    }
    const p = await client.producto.findUnique({
      where: { idPro },
      include: {
        marca: true,
        categoria: true,
      },
    });
    if (!p) return null;
    return toProductoDto(p);
  }

  async validarCatalogosProducto(producto: any): Promise<string | null> {
    if (process.env.DYNAMODB_TABLE) return null;
    const [marca, categoria] = await Promise.all([
      producto.idMarca ? prisma.marca.findUnique({ where: { idMarca: idValido(producto.idMarca)! } }) : null,
      producto.idCat ? prisma.categoria.findUnique({ where: { idCat: idValido(producto.idCat)! } }) : null,
    ]);
    if (producto.idMarca && !marca) return 'La marca seleccionada no existe';
    if (producto.idCat && !categoria) return 'La categoría seleccionada no existe';
    return null;
  }

  async codigoEnUso(codigoQR: string | null | undefined, idPro = 0): Promise<boolean> {
    const codigo = texto(codigoQR);
    if (!codigo) return false;
    if (process.env.DYNAMODB_TABLE) {
      const existente = await productoRepository.findByCodigoQR(codigo);
      return Boolean(existente && existente.idPro !== Number(idPro));
    }
    const existente = await prisma.producto.findFirst({
      where: {
        codigoQR: codigo,
        NOT: { idPro: Number(idPro) },
      },
      select: { idPro: true },
    });
    return Boolean(existente);
  }

  async listarAdmin() {
    if (process.env.DYNAMODB_TABLE) {
      const prods = await productoRepository.listProductos(1);
      return prods.map((p) => toProductoListDto(p));
    }
    const productos = await prisma.producto.findMany({
      orderBy: { nombrePro: 'asc' },
      include: {
        marca: true,
        categoria: true,
      },
    });
    return productos.map((p) => toProductoListDto(p));
  }

  async listarPos() {
    if (process.env.DYNAMODB_TABLE) {
      const prods = await productoRepository.listProductos(1, { soloActivos: true });
      return prods.map((p) => toProductoListDto(p));
    }
    const productos = await prisma.producto.findMany({
      where: { activoPro: true },
      orderBy: [{ nombrePro: 'asc' }, { idPro: 'asc' }],
      include: {
        marca: true,
        categoria: true,
      },
    });
    return productos.map((p) => toProductoListDto(p));
  }

  async listarPublico() {
    if (process.env.DYNAMODB_TABLE) {
      const prods = await productoRepository.listProductos(1, { soloActivos: true });
      return prods.map((p) => toProductoListDto(p));
    }
    const productos = await prisma.producto.findMany({
      where: { activoPro: true },
      orderBy: { nombrePro: 'asc' },
      include: {
        marca: true,
        categoria: true,
      },
    });
    return productos.map((p) => toProductoListDto(p));
  }

  async buscarPorQR(codigoQR: string) {
    if (process.env.DYNAMODB_TABLE) {
      const p = await productoRepository.findByCodigoQR(codigoQR);
      if (!p) return null;
      return toProductoDto(p);
    }
    const p = await prisma.producto.findUnique({
      where: { codigoQR },
      include: {
        marca: true,
        categoria: true,
      },
    });
    if (!p) return null;
    return toProductoDto(p);
  }


  async consultarExterno(codigo: string) {
    return this.lookupProvider.consultar(codigo);
  }

  async crear(body: any) {
    const errorValidacion = validarProducto(body);
    if (errorValidacion) {
      throw errorFuncional(errorValidacion, 400);
    }

    const errorCatalogos = await this.validarCatalogosProducto(body);
    if (errorCatalogos) {
      throw errorFuncional(errorCatalogos, 400);
    }

    if (await this.codigoEnUso(body.codigoQR)) {
      throw errorFuncional('El código de barras ya pertenece a otro producto', 409);
    }

    if (process.env.DYNAMODB_TABLE) {
      const nuevo = await productoRepository.createProducto({
        idSuc: 1,
        nombrePro: texto(body.nombre),
        precioVentaPro: Number(body.precio !== undefined ? body.precio : body.precioVenta),
        costoPro: body.costo !== null && body.costo !== undefined && body.costo !== '' ? Number(body.costo) : 0,
        existenciaPro: Number(body.existencia),
        stockMinimoPro: body.stockMinimo ? Number(body.stockMinimo) : 1,
        tamanoPro: textoNullable(body.tamano),
        presentacionPro: textoNullable(body.presentacion),
        tipoPro: textoNullable(body.tipo),
        codigoQR: textoNullable(body.codigoQR),
        skuPro: textoNullable(body.sku),
        imagenPro: textoNullable(body.imagen),
        idMarca: body.idMarca ? Number(idValido(body.idMarca)) : null,
        idCat: body.idCat ? Number(idValido(body.idCat)) : null,
        activoPro: true,
      });
      return await this.obtenerProducto(nuevo.idPro);
    }

    const nuevo = await prisma.producto.create({
      data: {
        nombrePro: texto(body.nombre),
        precioVentaPro: Number(body.precio),
        costoPro: body.costo !== null && body.costo !== undefined && body.costo !== '' ? Number(body.costo) : 0,
        existenciaPro: Number(body.existencia),
        stockMinimoPro: body.stockMinimo ? Number(body.stockMinimo) : 1,
        tamanoPro: textoNullable(body.tamano),
        presentacionPro: textoNullable(body.presentacion),
        tipoPro: textoNullable(body.tipo),
        codigoQR: textoNullable(body.codigoQR),
        skuPro: textoNullable(body.sku),
        imagenPro: textoNullable(body.imagen),
        idMarca: body.idMarca ? idValido(body.idMarca) : null,
        idCat: body.idCat ? idValido(body.idCat) : null,
      },
    });

    return await this.obtenerProducto(nuevo.idPro);
  }

  async actualizar(idPro: number, body: any) {
    const errorValidacion = validarProducto(body);
    if (errorValidacion) {
      throw errorFuncional(errorValidacion, 400);
    }

    if (!(await this.obtenerProducto(idPro))) {
      throw errorFuncional('Producto no encontrado', 404);
    }

    const errorCatalogos = await this.validarCatalogosProducto(body);
    if (errorCatalogos) {
      throw errorFuncional(errorCatalogos, 400);
    }

    if (await this.codigoEnUso(body.codigoQR, idPro)) {
      throw errorFuncional('El código de barras ya pertenece a otro producto', 409);
    }

    if (process.env.DYNAMODB_TABLE) {
      await productoRepository.updateProducto(idPro, {
        nombrePro: texto(body.nombre),
        precioVentaPro: Number(body.precio),
        costoPro: body.costo !== null && body.costo !== undefined && body.costo !== '' ? Number(body.costo) : 0,
        existenciaPro: Number(body.existencia),
        stockMinimoPro: body.stockMinimo ? Number(body.stockMinimo) : 1,
        tamanoPro: textoNullable(body.tamano),
        presentacionPro: textoNullable(body.presentacion),
        tipoPro: textoNullable(body.tipo),
        codigoQR: textoNullable(body.codigoQR),
        skuPro: textoNullable(body.sku),
        imagenPro: textoNullable(body.imagen),
        idMarca: body.idMarca ? Number(idValido(body.idMarca)) : null,
        idCat: body.idCat ? Number(idValido(body.idCat)) : null,
      });
      return await this.obtenerProducto(idPro);
    }

    await prisma.producto.update({

      where: { idPro },
      data: {
        nombrePro: texto(body.nombre),
        precioVentaPro: Number(body.precio),
        costoPro: body.costo !== null && body.costo !== undefined && body.costo !== '' ? Number(body.costo) : 0,
        existenciaPro: Number(body.existencia),
        stockMinimoPro: body.stockMinimo ? Number(body.stockMinimo) : 1,
        tamanoPro: textoNullable(body.tamano),
        presentacionPro: textoNullable(body.presentacion),
        tipoPro: textoNullable(body.tipo),
        codigoQR: textoNullable(body.codigoQR),
        skuPro: textoNullable(body.sku),
        imagenPro: textoNullable(body.imagen),
        idMarca: body.idMarca ? idValido(body.idMarca) : null,
        idCat: body.idCat ? idValido(body.idCat) : null,
      },
    });

    return await this.obtenerProducto(idPro);
  }

  async actualizarImagenLocal(idPro: number, filename: string, filePath?: string) {
    const productoExistente = await this.obtenerProducto(idPro);
    if (!productoExistente) {
      if (filePath) fs.unlink(filePath, () => undefined);
      throw errorFuncional('Producto no encontrado', 404);
    }

    const rutaPublica = `/uploads/productos/${filename}`;
    try {
      if (process.env.DYNAMODB_TABLE) {
        await productoRepository.updateProducto(idPro, { imagenPro: rutaPublica });
      } else {
        await prisma.producto.update({ where: { idPro }, data: { imagenPro: rutaPublica } });
      }
      return await this.obtenerProducto(idPro);
    } catch (error) {
      if (filePath) fs.unlink(filePath, () => undefined);
      throw error;
    }
  }

  async presignImagen(idPro: number, mimeType: string, extension?: string) {
    const producto = await this.obtenerProducto(idPro);
    if (!producto) {
      throw errorFuncional('Producto no encontrado', 404);
    }
    return await storageService.generarPresignedUpload({
      folder: 'productos',
      mimeType,
      extensionOriginal: extension,
      nombreArchivoOriginal: producto.nombre,
    });
  }

  async confirmarImagen(idPro: number, keyOUrl: string) {
    const anterior = await this.obtenerProducto(idPro);
    if (!anterior) {
      throw errorFuncional('Producto no encontrado', 404);
    }

    const rutaFinal = keyOUrl.startsWith('http')
      ? keyOUrl
      : `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${keyOUrl}`;

    if (process.env.DYNAMODB_TABLE) {
      await productoRepository.updateProducto(idPro, { imagenPro: rutaFinal });
    } else {
      await prisma.producto.update({
        where: { idPro },
        data: { imagenPro: rutaFinal },
      });
    }

    if (anterior.imagen && anterior.imagen !== rutaFinal) {
      eliminarUploadControlado(anterior.imagen, productosUploadDir, '/uploads/productos/');
    }

    return await this.obtenerProducto(idPro);
  }

  async eliminar(idPro: number) {
    const producto = await this.obtenerProducto(idPro);
    if (!producto) {
      throw errorFuncional('Producto no encontrado', 404);
    }

    if (process.env.DYNAMODB_TABLE) {
      if (producto.imagen) {
        eliminarUploadControlado(producto.imagen, productosUploadDir, '/uploads/productos/');
      }
      await productoRepository.deleteProducto(idPro);
      return { message: 'Producto eliminado correctamente' };
    }

    const [ventas, compras, pedidos] = await Promise.all([
      prisma.detVenta.count({ where: { idPro } }),
      prisma.detCompra.count({ where: { idPro } }),
      prisma.detallePedidoCliente.count({ where: { idPro } }),
    ]);

    if (ventas > 0 || compras > 0 || pedidos > 0) {
      const error: any = new Error(
        'No se puede eliminar el producto porque tiene ventas, compras o pedidos relacionados',
      );
      error.status = 409;
      throw error;
    }

    if (producto.imagen) {
      eliminarUploadControlado(producto.imagen, productosUploadDir, '/uploads/productos/');
    }

    await prisma.producto.delete({ where: { idPro } });
    return { message: 'Producto eliminado correctamente' };
  }

}

export const productosService = new ProductosService();






