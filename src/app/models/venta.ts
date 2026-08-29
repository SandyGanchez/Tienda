export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
export type EstadoVenta = 'COMPLETADA' | 'CANCELADA';

export interface ProductoPos {
  idPro: number;
  nombrePro: string;
  precioVentaPro: number;
  existenciaPro: number;
  codigoQR: string | null;
  skuPro: string | null;
  imagenPro: string | null;
  tamanoPro: string | null;
  presentacionPro: string | null;
  nombreMarca: string | null;
  nombreCat: string | null;
}
export interface ItemVenta {
  idPro: number;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  existenciaDisponible: number;
  subtotal: number;
  imagen: string | null;
}
export interface VentaResumen {
  idVenta: number;
  fechaVenta: string;
  horaVenta: string;
  total: number;
  metodoPago: MetodoPago;
  estadoVenta: EstadoVenta;
  idEmp: number;
  cajero: string;
  origenVenta: 'ONLINE' | 'POS';
}
export interface VentaDetalle extends VentaResumen {
  uuidVenta: string | null;
  idSesionCaja: number | null;
  folioPedido: string | null;
  montoRecibido: number | null;
  cambio: number;
  fechaCancelacion: string | null;
  motivoCancelacion: string | null;
  idEmpCancela: number | null;
  nombreEmpleadoCancela: string | null;
  nombreSuc: string | null;
  descripcionSuc: string | null;
  telefonoSuc: string | null;
  correoSuc: string | null;
  logoSuc: string | null;
  items: Array<{ idPro: number; nombre: string; cantidad: number; precioUnitario: number; subtotal: number }>;
}
export interface VentaRegistrada {
  idVenta: number;
  uuidVenta: string;
  idSesionCaja: number;
  fechaVenta: string;
  horaVenta: string;
  total: number;
  metodoPago: MetodoPago;
  montoRecibido: number | null;
  cambio: number;
  estadoVenta: EstadoVenta;
  cajero: { idEmp: number; nombre: string };
  items: Array<{ idPro: number; nombre: string; cantidad: number; precioUnitario: number; subtotal: number }>;
}
export interface CrearVentaDto {
  uuidVenta: string;
  items: Array<{ idPro: number; cantidad: number }>;
  metodoPago: MetodoPago;
  montoRecibido: number | null;
}
export interface VentaCancelada {
  idVenta: number;
  estadoVenta: 'CANCELADA';
  fechaCancelacion: string;
  motivoCancelacion: string;
  idEmpCancela: number;
}
