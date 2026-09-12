import { prisma, DbClient } from '../../config/prisma';
import { env } from '../../config/env';
import { esUrlS3 } from '../../config/s3';
import { comprobantesUploadDir } from '../../middlewares/upload.middleware';
import { dineroCentavos, errorFuncional, idValido, encodeId, texto, uuidValido } from '../../utils/formatters';
import { pedidoRepository } from '../../db/repositories/pedido.repository';
import { productoRepository } from '../../db/repositories/producto.repository';
import { configuracionRepository } from '../../db/repositories/configuracion.repository';
import {
  folioPedido,
  normalizarConfiguracionTransferencia,
  normalizarPedido,
  normalizarPedidoAdmin,
  configuracionTransferenciaPedido,
} from '../../dtos/pedido.dto';
import { storageService, IStorageService } from '../../services/storage.service';
import { OrderStateMachine, defaultOrderStateMachine } from './pedido-state.machine';

const HORAS_RESERVA_PEDIDO = 2;
const MAX_TOTAL_PEDIDO_CENTAVOS = 9999999999;

export {
  folioPedido,
  normalizarConfiguracionTransferencia,
  normalizarPedido,
  normalizarPedidoAdmin,
  configuracionTransferenciaPedido,
};

export function resolverComprobantePrivado(nombreFisico?: string | null): string | null {
  return storageService.resolverComprobantePrivado(nombreFisico);
}

export function mimeRealComprobante(rutaArchivo: string): string | null {
  return storageService.detectarMimeReal(rutaArchivo);
}

/**
 * =========================================================================
 * Interface Segregation & Dependency Inversion Principle (ISP / DIP) - Pedidos
 * =========================================================================
 * Segregación entre la operativa de cara al cliente y la administración:
 * - IClientePedidoService: Operaciones públicas de compras y comprobantes
 * - IAdminPedidoService: Operaciones de backoffice (aprobación, rechazo, entrega)
 * Con soporte para inyección de dependencias desacopladas en el constructor.
 */
export interface IClientePedidoService {
  obtenerSucursalDisponibleCliente(): Promise<number>;
  obtenerConfiguracionTransferencia(idSuc: number, exigirActiva?: boolean): Promise<any>;
  crearPedidoCliente(idCliente: number, body: any): Promise<any>;
  liberarPedidosExpirados(idCliente?: number): Promise<any>;
  listarPedidosCliente(idCliente: number): Promise<any>;
  obtenerPedidoSeguro(idPedido: number, idCliente: number, tx?: DbClient): Promise<any>;
  cancelarPedidoCliente(idPedido: number, idCliente: number): Promise<any>;
  presignComprobante(
    idPedido: number,
    idCliente: number,
    mimeType: string,
    extensionOriginal?: string,
    nombreOriginal?: string,
  ): Promise<any>;
  confirmarComprobante(
    idPedido: number,
    idCliente: number,
    keyOUrl: string,
    nombreOriginal?: string,
    mimeType?: string,
  ): Promise<any>;
}

export interface IAdminPedidoService {
  listarPedidosAdmin(idSuc: number): Promise<any>;
  obtenerPedidoAdmin(idPedido: number, idSuc: number, tx?: DbClient): Promise<any>;
  rechazarPedidoAdmin(idPedido: number, idSuc: number, idEmp: number, motivoInput: string): Promise<any>;
  aprobarPedidoAdmin(idPedido: number, idSuc: number, idEmp: number): Promise<any>;
  cambiarEstadoOperativo(idPedido: number, idSuc: number, estadoActual: string, estadoNuevo: string): Promise<any>;
}

export interface IPedidosService extends IClientePedidoService, IAdminPedidoService {}

export class PedidosService implements IPedidosService {
  constructor(
    private stateMachine: OrderStateMachine = defaultOrderStateMachine,
    private storage: IStorageService = storageService,
    private pedidoRepo: any = pedidoRepository,
    private prodRepo: any = productoRepository,
    private configRepo: any = configuracionRepository,
  ) {}

  async obtenerSucursalDisponibleCliente() {
    if (process.env.DYNAMODB_TABLE) return 1;

    const sucursales = await prisma.sucursal.findMany({
      orderBy: { idSuc: 'asc' },
      take: 2,
      select: { idSuc: true },
    });
    if (!sucursales.length) throw errorFuncional('No hay una sucursal disponible para recibir pedidos.', 409);
    if (sucursales.length > 1) {
      throw errorFuncional('Selecciona una sucursal antes de continuar con tu pedido.', 409);
    }
    return Number(sucursales[0].idSuc);
  }

  async obtenerConfiguracionTransferencia(idSuc: number, exigirActiva = true) {
    if (process.env.DYNAMODB_TABLE) {
      const conf = await this.configRepo.getConfiguracion(idSuc);
      if (!conf || (exigirActiva && !conf.activo)) {
        throw errorFuncional('Los pagos por transferencia no están disponibles en este momento.', 409);
      }
      return conf;
    }

    const configuracion = await prisma.configuracionTransferencia.findUnique({
      where: { idSuc: Number(idSuc) },
    });
    if (!configuracion || (exigirActiva && !configuracion.activo)) {
      throw errorFuncional('Los pagos por transferencia no están disponibles en este momento.', 409);
    }
    return configuracion;
  }

  async restaurarStockPedido(tx: DbClient, idPedido: number) {
    const detalles = await tx.detallePedidoCliente.findMany({
      where: { idPedido: Number(idPedido) },
      orderBy: { idPro: 'asc' },
    });
    for (const d of detalles) {
      await tx.producto.update({
        where: { idPro: d.idPro },
        data: { existenciaPro: { increment: d.cantidad } },
      });
    }
  }

  async expirarPedidoBloqueado(tx: DbClient, pedido: any): Promise<boolean> {
    const vencido =
      pedido.estado === 'PENDIENTE_PAGO' &&
      !pedido.comprobanteRuta &&
      pedido.fechaLimitePago &&
      new Date(pedido.fechaLimitePago).getTime() < Date.now();
    if (!vencido) return false;

    await this.restaurarStockPedido(tx, Number(pedido.idPedido));
    await tx.pedidoCliente.update({
      where: { idPedido: Number(pedido.idPedido) },
      data: { estado: 'EXPIRADO' },
    });
    return true;
  }

  async liberarPedidosExpirados(idCliente?: number | null) {
    if (process.env.DYNAMODB_TABLE) return;

    const where: any = {
      estado: 'PENDIENTE_PAGO',
      comprobanteRuta: null,
      fechaLimitePago: { lt: new Date() },
    };
    if (idCliente) where.idCliente = Number(idCliente);

    const candidatos = await prisma.pedidoCliente.findMany({
      where,
      select: { idPedido: true },
      orderBy: { idPedido: 'asc' },
      take: 50,
    });

    for (const candidato of candidatos) {
      try {
        await prisma.$transaction(async (tx) => {
          const p = await tx.pedidoCliente.findUnique({
            where: { idPedido: candidato.idPedido },
          });
          if (p) await this.expirarPedidoBloqueado(tx, p);
        });
      } catch (error: any) {
        console.error('No se pudo liberar un pedido expirado:', error.message);
      }
    }
  }

  async obtenerPedidoSeguro(idPedido: number, idCliente: number, client: DbClient = prisma) {
    if (process.env.DYNAMODB_TABLE) {
      const p = await this.pedidoRepo.getPedidoById(idCliente, idPedido);
      if (!p) return null;
      return {
        id: encodeId(p.idPedido),
        folio: folioPedido(p.idPedido),
        uuidPedido: `pedido-${p.idPedido}`,
        fechaPedido: p.fechaCreacion,
        fechaLimitePago: p.fechaCreacion,
        estado: p.estado,
        total: Number(p.totalPedido || 0),
        tieneComprobante: Boolean(p.comprobanteUrl),
        fechaComprobante: p.fechaCreacion,
        motivoRechazo: null,
        idVenta: null,
        fechaRevision: null,
        comprobanteUrl: p.comprobanteUrl || null,
        comprobante: p.comprobanteUrl ? { nombre: 'comprobante', mime: 'image/jpeg', fecha: p.fechaCreacion, url: p.comprobanteUrl } : null,
        items: (p.detalles || []).map((d: any) => ({
          productoId: encodeId(d.idPro),
          nombre: d.nombrePro,
          imagen: d.imagenPro || null,
          presentacion: null,
          cantidad: d.cantidad,
          precioUnitario: Number(d.precioUnitario),
          subtotal: Number(d.subtotal),
        })),
        configuracionTransferencia: null,
      };
    }

    const p = await client.pedidoCliente.findFirst({
      where: {
        idPedido: Number(idPedido),
        idCliente: Number(idCliente),
      },
      include: {
        detalles: {
          include: { producto: true },
          orderBy: { idDetallePedido: 'asc' },
        },
      },
    });
    if (!p) return null;

    let configuracionTransferencia = configuracionTransferenciaPedido(p);
    if (!configuracionTransferencia) {
      try {
        const conf = await client.configuracionTransferencia.findUnique({
          where: { idSuc: p.idSuc },
        });
        configuracionTransferencia = normalizarConfiguracionTransferencia(conf);
      } catch {
        configuracionTransferencia = null;
      }
    }

    let comprobanteUrl: string | null = null;
    if (p.comprobanteRuta) {
      try {
        if (this.storage.esS3(p.comprobanteRuta)) {
          const key = this.storage.extraerKey(p.comprobanteRuta) || p.comprobanteRuta;
          comprobanteUrl = await this.storage.generarPresignedDownload(key, p.comprobanteNombre, p.comprobanteMime);
        }
      } catch (err) {
        console.error('Error al generar presigned download para comprobante:', err);
      }
    }

    return {
      ...normalizarPedido(p),
      comprobanteUrl,
      comprobante: p.comprobanteRuta
        ? {
            nombre: p.comprobanteNombre || 'comprobante',
            mime: p.comprobanteMime || 'image/jpeg',
            fecha: p.fechaComprobante,
            url: comprobanteUrl,
          }
        : null,
      items: p.detalles.map((d) => ({
        productoId: encodeId(d.idPro),
        nombre: d.producto?.nombrePro || 'Producto',
        imagen: d.producto?.imagenPro || null,
        presentacion: [d.producto?.tamanoPro, d.producto?.presentacionPro].filter(Boolean).join(' · ') || null,
        cantidad: d.cantidad,
        precioUnitario: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
      configuracionTransferencia,
    };
  }

  async obtenerPedidoAdmin(idPedido: number, idSuc: number, client: DbClient = prisma) {
    if (process.env.DYNAMODB_TABLE) {
      const pedidos = await this.pedidoRepo.listPedidosAdmin(idSuc);
      const p = pedidos.find((item: any) => item.idPedido === idPedido);
      if (!p) return null;
      return {
        id: encodeId(p.idPedido),
        folio: folioPedido(p.idPedido),
        uuidPedido: `pedido-${p.idPedido}`,
        fechaPedido: p.fechaCreacion,
        fechaLimitePago: p.fechaCreacion,
        estado: p.estado,
        total: Number(p.totalPedido || 0),
        tieneComprobante: Boolean(p.comprobanteUrl),
        fechaComprobante: p.fechaCreacion,
        motivoRechazo: null,
        idVenta: null,
        fechaRevision: null,
        cliente: {
          id: encodeId(p.idCliente),
          nombre: p.clienteNombre || 'Cliente',
          correo: p.clienteCorreo || '',
          foto: null,
        },
        comprobanteUrl: p.comprobanteUrl || null,
        comprobante: p.comprobanteUrl ? { nombre: 'comprobante', mime: 'image/jpeg', fecha: p.fechaCreacion, url: p.comprobanteUrl } : null,
        empleadoRevisa: null,
        configuracionTransferencia: null,
        items: (p.detalles || []).map((item: any) => ({
          idPro: Number(item.idPro),
          nombre: item.nombrePro,
          imagen: item.imagenPro || null,
          presentacion: null,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precioUnitario),
          subtotal: Number(item.subtotal),
        })),
      };
    }

    const p = await client.pedidoCliente.findFirst({
      where: {
        idPedido: Number(idPedido),
        idSuc: Number(idSuc),
      },
      include: {
        cliente: true,
        empleadoRevisa: true,
        detalles: {
          include: { producto: true },
          orderBy: { idDetallePedido: 'asc' },
        },
      },
    });
    if (!p) return null;

    let configuracionTransferencia = configuracionTransferenciaPedido(p);
    if (!configuracionTransferencia) {
      try {
        const conf = await client.configuracionTransferencia.findUnique({
          where: { idSuc: p.idSuc },
        });
        configuracionTransferencia = normalizarConfiguracionTransferencia(conf);
      } catch {
        configuracionTransferencia = null;
      }
    }

    const empRevisa = p.empleadoRevisa
      ? [p.empleadoRevisa.nombreEmp, p.empleadoRevisa.apellidoPatEmp, p.empleadoRevisa.apellidoMatEmp]
          .filter(Boolean)
          .join(' ')
      : null;

    let comprobanteUrl: string | null = null;
    if (p.comprobanteRuta) {
      try {
        if (this.storage.esS3(p.comprobanteRuta)) {
          const key = this.storage.extraerKey(p.comprobanteRuta) || p.comprobanteRuta;
          comprobanteUrl = await this.storage.generarPresignedDownload(key, p.comprobanteNombre, p.comprobanteMime);
        }
      } catch (err) {
        console.error('Error al generar presigned download para comprobante admin:', err);
      }
    }

    return {
      ...normalizarPedidoAdmin(p),
      comprobanteUrl,
      comprobante: p.comprobanteRuta
        ? {
            nombre: p.comprobanteNombre || 'comprobante',
            mime: p.comprobanteMime || 'image/jpeg',
            fecha: p.fechaComprobante,
            url: comprobanteUrl,
          }
        : null,
      empleadoRevisa: empRevisa,
      configuracionTransferencia,
      items: p.detalles.map((item) => ({
        idPro: Number(item.idPro),
        nombre: item.producto?.nombrePro || 'Producto',
        imagen: item.producto?.imagenPro || null,
        presentacion: [item.producto?.tamanoPro, item.producto?.presentacionPro].filter(Boolean).join(' · ') || null,
        cantidad: Number(item.cantidad),
        precioUnitario: Number(item.precioUnitario),
        subtotal: Number(item.subtotal),
      })),
    };
  }

  async crearPedidoCliente(idCliente: number, body: any) {
    const uuid = uuidValido(body?.uuidPedido);
    if (!uuid) throw errorFuncional('uuidPedido no es válido.', 400);

    let idSuc = idValido(body?.idSuc);
    if (!idSuc) {
      idSuc = await this.obtenerSucursalDisponibleCliente();
    }

    if (!Array.isArray(body?.items) || !body.items.length) {
      throw errorFuncional('El pedido debe incluir al menos un producto.', 400);
    }

    const cantidades = new Map<number, number>();
    for (const item of body.items) {
      const idPro = idValido(item?.idPro ?? item?.id ?? item?.productoId);
      const cantidad = Number(item?.cantidad);
      if (!idPro || !Number.isInteger(cantidad) || cantidad <= 0) {
        throw errorFuncional('Los productos o cantidades no son válidos.', 400);
      }
      cantidades.set(idPro, (cantidades.get(idPro) || 0) + cantidad);
    }

    const ids = [...cantidades.keys()].sort((a, b) => a - b);
    const configuracion = await this.obtenerConfiguracionTransferencia(idSuc);

    if (process.env.DYNAMODB_TABLE) {
      const itemsPedido = [];
      let totalCentavos = 0;
      for (const [idPro, cantidad] of cantidades.entries()) {
        const prod = await this.prodRepo.getProductoById(idPro, idSuc);
        if (!prod) {
          throw errorFuncional('Uno de los productos ya no está disponible.', 404, { idPro });
        }
        if (!prod.activoPro) {
          throw errorFuncional(`${prod.nombrePro} ya no está disponible para venta.`, 409, { idPro });
        }
        if (cantidad > prod.existenciaPro) {
          throw errorFuncional(`Stock insuficiente para ${prod.nombrePro}.`, 409, { idPro, disponible: prod.existenciaPro });
        }
        const precioCentavos = dineroCentavos(prod.precioVentaPro);
        if (precioCentavos === null || precioCentavos < 0) {
          throw errorFuncional(`${prod.nombrePro} no tiene un precio válido.`, 409, { idPro });
        }
        const subtotalCentavos = precioCentavos * cantidad;
        totalCentavos += subtotalCentavos;
        itemsPedido.push({
          idPro,
          nombrePro: prod.nombrePro,
          cantidad,
          precioUnitario: precioCentavos / 100,
          imagenPro: prod.imagenPro || undefined,
        });
      }

      const pedido = await this.pedidoRepo.createPedido({
        idCliente,
        idSuc,
        totalPedido: totalCentavos / 100,
        items: itemsPedido,
      });

      return await this.obtenerPedidoSeguro(pedido.idPedido, idCliente);
    }

    return await prisma.$transaction(async (tx) => {
      const repetido = await tx.pedidoCliente.findUnique({
        where: { uuidPedido: uuid },
      });
      if (repetido) {
        if (Number(repetido.idCliente) !== Number(idCliente)) {
          throw errorFuncional('El identificador del pedido ya está en uso.', 409);
        }
        return await this.obtenerPedidoSeguro(repetido.idPedido, idCliente, tx);
      }

      const countFn = typeof (tx.pedidoCliente as any)?.count === 'function'
        ? (tx.pedidoCliente as any).count.bind(tx.pedidoCliente)
        : async (args: any) => ((tx.pedidoCliente as any)?.findMany ? (await (tx.pedidoCliente as any).findMany(args)).length : 0);
      const pendientes = await countFn({
        where: {
          idCliente: Number(idCliente),
          estado: 'PENDIENTE_PAGO',
          comprobanteRuta: null,
          fechaLimitePago: { gt: new Date() },
        },
      });
      if (pendientes >= 3) {
        throw errorFuncional(
          'Tienes 3 pedidos pendientes de pago. Completa o cancela alguno de ellos antes de generar uno nuevo.',
          409,
        );
      }

      const productos = await tx.producto.findMany({
        where: { idPro: { in: ids } },
        orderBy: { idPro: 'asc' },
      });

      if (productos.length !== ids.length) {
        const encontrados = new Set(productos.map((p) => Number(p.idPro)));
        const faltante = ids.find((id) => !encontrados.has(id));
        throw errorFuncional('Uno de los productos ya no está disponible.', 404, { idPro: faltante });
      }

      let totalCentavos = 0;
      const itemsPedido = productos.map((producto) => {
        const cantidad = cantidades.get(Number(producto.idPro))!;
        const disponible = Number(producto.existenciaPro) || 0;
        if (!producto.activoPro) {
          throw errorFuncional(`${producto.nombrePro || 'El producto'} ya no está disponible para venta.`, 409, { idPro: producto.idPro });
        }
        if (cantidad > disponible) {
          throw errorFuncional(`Stock insuficiente para ${producto.nombrePro || 'el producto'}.`, 409, { idPro: producto.idPro, disponible });
        }
        const precioCentavos = dineroCentavos(producto.precioVentaPro);
        if (precioCentavos === null || precioCentavos < 0) {
          throw errorFuncional(`${producto.nombrePro || 'El producto'} no tiene un precio válido.`, 409, { idPro: producto.idPro });
        }
        const subtotalCentavos = precioCentavos * cantidad;
        totalCentavos += subtotalCentavos;
        if (!Number.isSafeInteger(totalCentavos) || totalCentavos > MAX_TOTAL_PEDIDO_CENTAVOS) {
          throw errorFuncional('El total del pedido supera el límite permitido.', 409);
        }
        return {
          idPro: Number(producto.idPro),
          cantidad,
          precioUnitario: precioCentavos / 100,
          subtotal: subtotalCentavos / 100,
        };
      });

      const ahora = new Date();
      const fechaLimitePago = new Date(ahora.getTime() + HORAS_RESERVA_PEDIDO * 60 * 60 * 1000);

      const pedido = await tx.pedidoCliente.create({
        data: {
          uuidPedido: uuid,
          idCliente,
          idSuc,
          fechaPedido: ahora,
          total: totalCentavos / 100,
          estado: 'PENDIENTE_PAGO',
          fechaLimitePago,
          bancoSnapshot: configuracion.banco,
          titularSnapshot: configuracion.titular,
          clabeSnapshot: configuracion.clabe || null,
          numeroCuentaSnapshot: configuracion.numeroCuenta || null,
          instruccionesSnapshot: configuracion.instrucciones || null,
          detalles: {
            create: itemsPedido.map((item) => ({
              idPro: item.idPro,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: item.subtotal,
            })),
          },
        },
      });

      for (const item of itemsPedido) {
        await tx.producto.update({
          where: { idPro: item.idPro },
          data: { existenciaPro: { decrement: item.cantidad } },
        });
      }

      return await this.obtenerPedidoSeguro(pedido.idPedido, idCliente, tx);
    });
  }

  async cancelarPedidoCliente(idPedido: number, idCliente: number) {
    return await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idCliente },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);

      if (await this.expirarPedidoBloqueado(tx, pedido)) {
        throw errorFuncional('Tu reserva expiró y los productos volvieron al inventario.', 409);
      }

      if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
        throw errorFuncional(`El pedido ya no puede cancelarse porque está ${pedido.estado}.`, 409);
      }

      await this.restaurarStockPedido(tx, idPedido);
      await tx.pedidoCliente.update({
        where: { idPedido },
        data: { estado: 'CANCELADO' },
      });

      return await this.obtenerPedidoSeguro(idPedido, idCliente, tx);
    });
  }

  async presignComprobante(
    idPedido: number,
    idCliente: number,
    mimeType: string,
    extensionOriginal?: string,
    nombreOriginal?: string,
  ) {
    const pedido = await prisma.pedidoCliente.findFirst({
      where: { idPedido, idCliente },
    });
    if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
    if (!this.stateMachine.puedeTransicionar('SUBIR_COMPROBANTE', pedido.estado)) {
      throw errorFuncional(`No se puede subir comprobante a un pedido en estado ${pedido.estado}.`, 409);
    }
    return await this.storage.generarPresignedUpload({
      folder: 'comprobantes',
      mimeType,
      extensionOriginal,
      nombreArchivoOriginal: nombreOriginal || `comprobante-${idPedido}`,
    });
  }

  async confirmarComprobante(
    idPedido: number,
    idCliente: number,
    keyOUrl: string,
    nombreOriginal?: string,
    mimeType?: string,
  ) {
    return await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idCliente },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);

      if (await this.expirarPedidoBloqueado(tx, pedido)) {
        throw errorFuncional('Tu reserva expiró y los productos volvieron al inventario.', 409);
      }

      this.stateMachine.validarTransicion('SUBIR_COMPROBANTE', pedido.estado);

      const anteriorRuta = pedido.comprobanteRuta;
      const key = this.storage.extraerKey(keyOUrl) || keyOUrl;
      const mime = mimeType || 'image/jpeg';
      const baseFilename = key.includes('/') ? key.split('/').pop() : key;
      const nombreSeguro = this.storage.sanitizarNombre(nombreOriginal || baseFilename || 'comprobante.jpg');

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          comprobanteRuta: key,
          comprobanteMime: mime,
          comprobanteNombre: nombreSeguro,
          fechaComprobante: new Date(),
          estado: 'EN_REVISION',
          motivoRechazo: null,
        },
      });

      if (anteriorRuta && anteriorRuta !== key) {
        void this.storage.eliminarArchivo(anteriorRuta, comprobantesUploadDir, '');
      }

      return await this.obtenerPedidoSeguro(idPedido, idCliente, tx);
    });
  }

  async rechazarPedidoAdmin(idPedido: number, idSuc: number, idEmp: number, motivoInput: string) {
    const motivo = texto(motivoInput);
    if (!idPedido) throw errorFuncional('El pedido no es válido.', 400);
    if (motivo.length < 3 || motivo.length > 255) {
      throw errorFuncional('El motivo debe tener entre 3 y 255 caracteres.', 400);
    }

    return await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      this.stateMachine.validarTransicion('RECHAZAR_PAGO', pedido.estado);

      const anteriorComprobante = pedido.comprobanteRuta;

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          estado: 'RECHAZADO',
          idEmpRevisa: idEmp,
          fechaRevision: new Date(),
          motivoRechazo: motivo,
          comprobanteRuta: null,
          comprobanteMime: null,
          comprobanteNombre: null,
          fechaComprobante: null,
        },
      });

      if (anteriorComprobante) {
        void this.storage.eliminarArchivo(anteriorComprobante, comprobantesUploadDir, '');
      }

      return await this.obtenerPedidoAdmin(idPedido, idSuc, tx);
    });
  }

  async aprobarPedidoAdmin(idPedido: number, idSuc: number, idEmp: number) {
    if (!idPedido) throw errorFuncional('El pedido no es válido.', 400);

    return await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc },
        include: {
          detalles: { orderBy: { idPro: 'asc' } },
        },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      if (pedido.estado === 'PAGADO' && pedido.idVenta) throw errorFuncional('El pedido ya fue aprobado.', 409);
      this.stateMachine.validarTransicion('APROBAR_PAGO', pedido.estado);
      if (!pedido.comprobanteRuta || !pedido.fechaComprobante)
        throw errorFuncional('El pedido no tiene un comprobante válido para revisar.', 409);
      if (!esUrlS3(pedido.comprobanteRuta) && !resolverComprobantePrivado(pedido.comprobanteRuta)) {
        throw errorFuncional('El archivo del comprobante no está disponible.', 409);
      }
      if (!pedido.detalles.length) throw errorFuncional('El pedido no contiene productos.', 409);

      let sumaCentavos = 0;
      for (const detalle of pedido.detalles) {
        const cantidad = Number(detalle.cantidad);
        const precioCentavos = dineroCentavos(detalle.precioUnitario);
        const subtotalCentavos = dineroCentavos(detalle.subtotal);
        if (
          !Number.isInteger(cantidad) ||
          cantidad <= 0 ||
          precioCentavos === null ||
          precioCentavos < 0 ||
          subtotalCentavos === null ||
          subtotalCentavos !== precioCentavos * cantidad
        ) {
          throw errorFuncional('Los importes históricos del pedido no son coherentes.', 409);
        }
        sumaCentavos += subtotalCentavos;
        if (!Number.isSafeInteger(sumaCentavos)) throw errorFuncional('El total del pedido no es válido.', 409);
      }
      const totalPedidoCentavos = dineroCentavos(pedido.total);
      if (totalPedidoCentavos === null || sumaCentavos !== totalPedidoCentavos)
        throw errorFuncional('El total del pedido no coincide con sus productos.', 409);

      const ahora = new Date();

      const venta = await tx.venta.create({
        data: {
          uuidVenta: crypto.randomUUID(),
          fechaVenta: ahora,
          horaVenta: ahora,
          total: totalPedidoCentavos / 100,
          metodoPago: 'TRANSFERENCIA',
          montoRecibido: null,
          cambio: 0.0,
          estadoVenta: 'COMPLETADA',
          idEmp,
          idSuc: pedido.idSuc,
          detalles: {
            create: pedido.detalles.map((d) => ({
              idPro: d.idPro,
                cantidadDetVenta: d.cantidad,
              precioUnitarioDetVenta: Number(d.precioUnitario),
              subtotalDetVenta: Number(d.subtotal),
            })),
          },
        },
      });

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          estado: 'PAGADO',
          idEmpRevisa: idEmp,
          fechaRevision: ahora,
          motivoRechazo: null,
          idVenta: venta.idVenta,
        },
      });

      return await this.obtenerPedidoAdmin(idPedido, idSuc, tx);
    });
  }

  async cambiarEstadoOperativo(idPedido: number, idSuc: number, estadoActual: string, estadoNuevo: string) {
    if (!idPedido) throw errorFuncional('El pedido no es válido.', 400);

    if (process.env.DYNAMODB_TABLE) {
      const pedidos = await this.pedidoRepo.listPedidosAdmin(idSuc);
      const pedido = pedidos.find((p: any) => p.idPedido === idPedido);
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      await this.pedidoRepo.updateEstado(pedido.idCliente, idPedido, estadoNuevo as any);
      return await this.obtenerPedidoAdmin(idPedido, idSuc);
    }

    return await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      if (pedido.estado !== estadoActual)
        throw errorFuncional(`El pedido debe estar en estado ${estadoActual} para continuar.`, 409);

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: { estado: estadoNuevo },
      });

      return await this.obtenerPedidoAdmin(idPedido, idSuc, tx);
    });
  }

  async listarPedidosCliente(idCliente: number) {
    if (process.env.DYNAMODB_TABLE) {
      const rows = await this.pedidoRepo.listPedidosCliente(idCliente);
      return rows.map((r: any) => ({
        id: encodeId(r.idPedido),
        folio: folioPedido(r.idPedido),
        uuidPedido: `pedido-${r.idPedido}`,
        fechaPedido: r.fechaCreacion,
        fechaLimitePago: r.fechaCreacion,
        estado: r.estado,
        total: Number(r.totalPedido),
        tieneComprobante: Boolean(r.comprobanteUrl),
        fechaComprobante: r.fechaCreacion,
        motivoRechazo: null,
        idVenta: null,
        fechaRevision: null,
      }));
    }
    const pedidos = await prisma.pedidoCliente.findMany({
      where: { idCliente },
      orderBy: [{ fechaPedido: 'desc' }, { idPedido: 'desc' }],
    });
    return pedidos.map(normalizarPedido);
  }

  async listarPedidosAdmin(idSuc: number) {
    if (process.env.DYNAMODB_TABLE) {
      const rows = await this.pedidoRepo.listPedidosAdmin(idSuc);
      return rows.map((r: any) => ({
        id: encodeId(r.idPedido),
        folio: folioPedido(r.idPedido),
        uuidPedido: `pedido-${r.idPedido}`,
        fechaPedido: r.fechaCreacion,
        fechaLimitePago: r.fechaCreacion,
        estado: r.estado,
        total: Number(r.totalPedido),
        tieneComprobante: Boolean(r.comprobanteUrl),
        fechaComprobante: r.fechaCreacion,
        motivoRechazo: null,
        idVenta: null,
        fechaRevision: null,
        cliente: {
          id: encodeId(r.idCliente),
          nombre: r.clienteNombre || 'Cliente',
          correo: r.clienteCorreo || '',
          foto: null,
        },
      }));
    }
    const pedidos = await prisma.pedidoCliente.findMany({
      where: { idSuc },
      orderBy: [{ fechaPedido: 'desc' }, { idPedido: 'desc' }],
      include: {
        cliente: true,
        empleadoRevisa: true,
      },
    });
    return pedidos.map(normalizarPedidoAdmin);
  }
}

export const pedidosService = new PedidosService();





