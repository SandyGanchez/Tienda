export type EstadoPedidoCliente =
  | 'PENDIENTE_PAGO'
  | 'EN_REVISION'
  | 'PAGADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | 'EXPIRADO'
  | 'LISTO'
  | 'ENTREGADO';

export interface ConfiguracionTransferencia {
  banco: string;
  titular: string;
  clabe: string | null;
  numeroCuenta: string | null;
  instrucciones: string | null;
}

export interface ConfiguracionTransferenciaAdmin extends ConfiguracionTransferencia {
  idConfiguracion: number;
  idSuc: number;
  activo: boolean;
  fechaActualizacion: string;
}

export interface ConfiguracionTransferenciaDto {
  banco: string;
  titular: string;
  clabe: string;
  numeroCuenta: string;
  instrucciones: string;
  activo: boolean;
}

export interface DetallePedidoCliente {
  idPro: number;
  nombre: string;
  imagen: string | null;
  presentacion: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoClienteResumen {
  idPedido: number;
  folio: string;
  uuidPedido: string;
  fechaPedido: string;
  fechaLimitePago: string | null;
  estado: EstadoPedidoCliente;
  total: number;
  tieneComprobante: boolean;
  fechaComprobante: string | null;
  motivoRechazo: string | null;
  idVenta: number | null;
  fechaRevision: string | null;
}

export interface PedidoCliente extends PedidoClienteResumen {
  items: DetallePedidoCliente[];
  configuracionTransferencia: ConfiguracionTransferencia | null;
}

export interface CrearPedidoRequest {
  uuidPedido: string;
  items: Array<{ idPro: number; cantidad: number }>;
}

export interface ClientePedidoAdmin {
  idCliente: number;
  nombre: string;
  correo: string;
  foto: string | null;
}

export interface ComprobantePedidoAdmin {
  nombre: string;
  mime: string;
  fecha: string | null;
}

export interface PedidoAdminResumen {
  idPedido: number;
  folio: string;
  uuidPedido: string;
  fechaPedido: string;
  fechaLimitePago: string | null;
  total: number;
  estado: EstadoPedidoCliente;
  fechaComprobante: string | null;
  comprobante: ComprobantePedidoAdmin | null;
  fechaRevision: string | null;
  motivoRechazo: string | null;
  idVenta: number | null;
  cliente: ClientePedidoAdmin;
}

export interface PedidoAdminDetalle extends PedidoAdminResumen {
  empleadoRevisa: string | null;
  configuracionTransferencia: ConfiguracionTransferencia | null;
  items: DetallePedidoCliente[];
}
