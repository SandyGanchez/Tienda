import { formatearFechaVenta, formatearHoraVenta, encodeId } from '../utils/formatters';
import { empleadoSeguro } from '../utils/security';

export const toVentaRegistradaDto = (v: any, empleado?: any) => {
  if (!v) return null;
  return {
    id: encodeId(v.idVenta),
    uuid: v.uuidVenta,
    sesionCajaId: encodeId(v.idSesionCaja),
    fecha: formatearFechaVenta(v.fechaVenta),
    hora: formatearHoraVenta(v.horaVenta),
    total: Number(v.total ?? v.totalVenta ?? 0),
    metodoPago: v.metodoPago,
    montoRecibido: v.montoRecibido !== null && v.montoRecibido !== undefined ? Number(v.montoRecibido) : (v.pagoCon !== undefined ? Number(v.pagoCon) : null),
    cambio: Number(v.cambio || 0),
    estado: v.estadoVenta || 'COMPLETADA',
    cajero: { 
      id: encodeId(Number(v.idEmp)), 
      nombre: empleado ? empleadoSeguro(empleado).nombre : (v.empleado ? [v.empleado.nombreEmp, v.empleado.apellidoPatEmp, v.empleado.apellidoMatEmp].filter(Boolean).join(' ') : null)
    },
    items: v.detalles?.map((d: any) => ({
      id: encodeId(d.idPro),
      nombre: d.nombrePro || d.producto?.nombrePro || 'Producto',
      cantidad: d.cantidadDetVenta ?? d.cantidad,
      precioUnitario: Number(d.precioUnitarioDetVenta ?? d.precioUnitario),
      subtotal: Number(d.subtotalDetVenta ?? d.subtotal),
    })) || [],
  };
};

export const toVentaListDto = (v: any) => {
  if (!v) return null;
  const cajeroStr = v.empleado
    ? [v.empleado.nombreEmp, v.empleado.apellidoPatEmp, v.empleado.apellidoMatEmp].filter(Boolean).join(' ')
    : (v.empleadoNombre || null);
  const origen = v.pedidos && v.pedidos.length > 0 ? 'ONLINE' : 'POS';

  return {
    id: encodeId(v.idVenta),
    uuid: v.uuidVenta || `venta-${v.idVenta}`,
    sesionCajaId: encodeId(v.idSesionCaja),
    fecha: formatearFechaVenta(v.fechaVenta),
    hora: formatearHoraVenta(v.horaVenta || v.fechaVenta),
    total: Number(v.total ?? v.totalVenta ?? 0),
    metodoPago: v.metodoPago || 'EFECTIVO',
    estado: v.estadoVenta || 'COMPLETADA',
    origen,
    cajero: cajeroStr,
  };
};

export const toVentaDetalleDto = (v: any) => {
  if (!v) return null;
  
  const cajeroStr = v.empleado
    ? [v.empleado.nombreEmp, v.empleado.apellidoPatEmp, v.empleado.apellidoMatEmp].filter(Boolean).join(' ')
    : (v.empleadoNombre || null);
  const canceladorStr = v.empleadoCancela
    ? [v.empleadoCancela.nombreEmp, v.empleadoCancela.apellidoPatEmp, v.empleadoCancela.apellidoMatEmp].filter(Boolean).join(' ')
    : null;
  const origen = v.pedidos && v.pedidos.length > 0 ? 'ONLINE' : 'POS';

  return {
    id: encodeId(v.idVenta),
    uuid: v.uuidVenta || `venta-${v.idVenta}`,
    sesionCajaId: encodeId(v.idSesionCaja),
    fecha: formatearFechaVenta(v.fechaVenta),
    hora: formatearHoraVenta(v.horaVenta || v.fechaVenta),
    total: Number(v.total ?? v.totalVenta ?? 0),
    metodoPago: v.metodoPago || 'EFECTIVO',
    montoRecibido: v.montoRecibido !== null && v.montoRecibido !== undefined ? Number(v.montoRecibido) : (v.pagoCon !== undefined ? Number(v.pagoCon) : null),
    cambio: Number(v.cambio || 0),
    estado: v.estadoVenta || 'COMPLETADA',
    fechaCancelacion: v.fechaCancelacion?.toISOString ? v.fechaCancelacion.toISOString() : (v.fechaCancelacion || null),
    motivoCancelacion: v.motivoCancelacion || null,
    cajeroCancela: canceladorStr,
    sucursal: v.sucursal?.nombreSuc || v.nombreSuc || 'Doña paty',
    origen,
    cajero: { id: encodeId(Number(v.idEmp)), nombre: cajeroStr },
    items: v.detalles?.map((d: any) => ({
      idDetalle: encodeId(d.idDetVenta || d.idPro),
      productoId: encodeId(d.idPro),
      nombre: d.producto?.nombrePro || d.nombrePro || 'Producto',
      codigoQR: d.producto?.codigoQR || d.codigoQR || null,
      sku: d.producto?.skuPro || d.skuPro || null,
      cantidad: d.cantidadDetVenta ?? d.cantidad,
      precioUnitario: Number(d.precioUnitarioDetVenta ?? d.precioUnitario),
      subtotal: Number(d.subtotalDetVenta ?? d.subtotal),
    })) || [],
  };
};
