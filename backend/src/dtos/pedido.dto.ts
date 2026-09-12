import { encodeId } from '../utils/formatters';

export function folioPedido(idPedido: number): string {
  return `PED-${String(idPedido).padStart(6, '0')}`;
}

export function normalizarConfiguracionTransferencia(row: any, incluirAdministrativo = false) {
  if (!row) return null;
  const configuracion = {
    banco: row.banco,
    titular: row.titular,
    clabe: row.clabe,
    numeroCuenta: row.numeroCuenta,
    instrucciones: row.instrucciones,
  };
  return incluirAdministrativo
    ? {
        idConfiguracion: Number(row.idConfiguracion),
        idSuc: Number(row.idSuc),
        ...configuracion,
        activo: Boolean(row.activo),
        fechaActualizacion: row.fechaActualizacion,
      }
    : configuracion;
}

export function normalizarPedido(row: any) {
  return {
    id: encodeId(Number(row.idPedido)),
    folio: folioPedido(row.idPedido),
    uuidPedido: row.uuidPedido,
    fechaPedido: row.fechaPedido,
    fechaLimitePago: row.fechaLimitePago,
    estado: row.estado,
    total: Number(row.total),
    tieneComprobante: Boolean(row.comprobanteRuta),
    fechaComprobante: row.fechaComprobante || null,
    motivoRechazo: row.motivoRechazo || null,
    idVenta: row.idVenta === null || row.idVenta === undefined ? null : encodeId(Number(row.idVenta)),
    fechaRevision: row.fechaRevision || null,
  };
}

export function normalizarPedidoAdmin(row: any) {
  return {
    ...normalizarPedido(row),
    cliente: {
      id: encodeId(Number(row.cliente?.idCliente || row.idCliente)),
      nombre: [row.cliente?.nombreCliente, row.cliente?.apellidoPatCliente, row.cliente?.apellidoMatCliente]
        .filter(Boolean)
        .join(' '),
      correo: row.cliente?.correoCliente || '',
      foto: row.cliente?.fotoPerfil || null,
    },
  };
}

export function configuracionTransferenciaPedido(pedido: any) {
  const tieneSnapshot = [
    pedido.bancoSnapshot,
    pedido.titularSnapshot,
    pedido.clabeSnapshot,
    pedido.numeroCuentaSnapshot,
    pedido.instruccionesSnapshot,
  ].some((valor) => valor !== null && valor !== undefined);
  if (!tieneSnapshot) return null;
  return {
    banco: pedido.bancoSnapshot,
    titular: pedido.titularSnapshot,
    clabe: pedido.clabeSnapshot,
    numeroCuenta: pedido.numeroCuentaSnapshot,
    instrucciones: pedido.instruccionesSnapshot,
  };
}
