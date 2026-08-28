export interface ProductoParaCarrito {
  idPro: number;
  nombrePro: string;
  precioVentaPro: number;
  existenciaPro: number | null;
  imagenPro: string | null;
  tamanoPro: string | null;
  presentacionPro: string | null;
}

export interface ItemCarrito {
  idPro: number;
  nombre: string;
  precioMostrado: number;
  cantidad: number;
  imagen: string | null;
  stockConocido: number;
  presentacion: string | null;
}
