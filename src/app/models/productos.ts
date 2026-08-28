export interface Producto {
  idPro: number;
  nombrePro: string | null;
  precioVentaPro: number | null;
  costoPro: number | null;
  existenciaPro: number | null;
  stockMinimoPro: number | null;
  tamanoPro: string | null;
  presentacionPro: string | null;
  tipoPro: string | null;
  codigoQR: string | null;
  skuPro: string | null;
  imagenPro: string | null;
  idMarca: number | null;
  idCat: number | null;
  nombreMarca?: string | null;
  nombreCat?: string | null;
  pendienteSync?: number;
}

export interface CrearProductoDto {
  nombre: string;
  precio: number;
  costo: number | null;
  existencia: number;
  stockMinimo: number | null;
  tamano: string;
  presentacion: string;
  tipo: string;
  codigoQR: string | null;
  sku: string | null;
  imagen: string | null;
  idMarca: number;
  idCat: number;
}

export type ProductoResponse = Producto;
export type Productos = Producto;
