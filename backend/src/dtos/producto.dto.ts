import { encodeId } from '../utils/formatters';

export const toProductoDto = (producto: any) => {
  if (!producto) return null;
  return {
    id: encodeId(producto.idPro),
    nombre: producto.nombrePro,
    precioVenta: Number(producto.precioVentaPro),
    costo: producto.costoPro !== null && producto.costoPro !== undefined ? Number(producto.costoPro) : null,
    existencia: producto.existenciaPro,
    stockMinimo: producto.stockMinimoPro,
    tamano: producto.tamanoPro,
    presentacion: producto.presentacionPro,
    tipo: producto.tipoPro,
    codigoQR: producto.codigoQR,
    sku: producto.skuPro,
    imagen: producto.imagenPro,
    activo: producto.activoPro,
    idMarca: encodeId(producto.idMarca || producto.marca?.idMarca || producto.marca?.id) || null,
    idCat: encodeId(producto.idCat || producto.categoria?.idCat || producto.categoria?.id) || null,
    marca: (producto.idMarca || producto.marca || producto.nombreMarca || producto.marcaNombre) ? {
      id: encodeId(producto.idMarca || producto.marca?.idMarca || producto.marca?.id) || null,
      nombre: producto.marca?.nombreMarca || producto.marca?.nombre || producto.nombreMarca || producto.marcaNombre || null
    } : null,
    categoria: (producto.idCat || producto.categoria || producto.nombreCat || producto.categoriaNombre) ? {
      id: encodeId(producto.idCat || producto.categoria?.idCat || producto.categoria?.id) || null,
      nombre: producto.categoria?.nombreCat || producto.categoria?.nombre || producto.nombreCat || producto.categoriaNombre || null
    } : null,
  };
};

export const toProductoListDto = (producto: any) => {
  if (!producto) return null;
  return {
    id: encodeId(producto.idPro),
    nombre: producto.nombrePro,
    precioVenta: Number(producto.precioVentaPro),
    costo: producto.costoPro !== null && producto.costoPro !== undefined ? Number(producto.costoPro) : null,
    existencia: producto.existenciaPro || 0,
    stockMinimo: producto.stockMinimoPro,
    codigoQR: producto.codigoQR,
    sku: producto.skuPro,
    imagen: producto.imagenPro,
    tamano: producto.tamanoPro,
    presentacion: producto.presentacionPro,
    idMarca: encodeId(producto.idMarca || producto.marca?.idMarca || producto.marca?.id) || null,
    idCat: encodeId(producto.idCat || producto.categoria?.idCat || producto.categoria?.id) || null,
    marca: (producto.idMarca || producto.marca || producto.nombreMarca || producto.marcaNombre) ? {
      id: encodeId(producto.idMarca || producto.marca?.idMarca || producto.marca?.id) || null,
      nombre: producto.marca?.nombreMarca || producto.marca?.nombre || producto.nombreMarca || producto.marcaNombre || null
    } : null,
    categoria: (producto.idCat || producto.categoria || producto.nombreCat || producto.categoriaNombre) ? {
      id: encodeId(producto.idCat || producto.categoria?.idCat || producto.categoria?.id) || null,
      nombre: producto.categoria?.nombreCat || producto.categoria?.nombre || producto.nombreCat || producto.categoriaNombre || null
    } : null,
  };
};
