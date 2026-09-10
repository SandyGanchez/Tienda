import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';
import { errorFuncional } from '../../utils/formatters';

export interface DetalleVentaItem {
  idPro: number;
  nombrePro: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VentaEntity {
  idVenta: number;
  idSuc: number;
  idEmp: number;
  idSesionCaja: number;
  totalVenta: number;
  pagoCon?: number;
  cambio?: number;
  metodoPago: string;
  fechaVenta: string;
  detalles: DetalleVentaItem[];
}

export class VentaRepository {
  async createVenta(data: {
    idSuc: number;
    idEmp: number;
    idSesionCaja: number;
    totalVenta: number;
    pagoCon?: number;
    cambio?: number;
    metodoPago?: string;
    items: Array<{ idPro: number; cantidad: number; precioUnitario: number; nombrePro?: string }>;
  }): Promise<VentaEntity> {
    const idVenta = await getNextSequence('venta', 1);
    const now = new Date().toISOString();

    const detalles: DetalleVentaItem[] = data.items.map((i) => ({
      idPro: i.idPro,
      nombrePro: i.nombrePro || `Producto #${i.idPro}`,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      subtotal: Number((i.cantidad * i.precioUnitario).toFixed(2)),
    }));

    const ventaItem: VentaEntity = {
      idVenta,
      idSuc: data.idSuc,
      idEmp: data.idEmp,
      idSesionCaja: data.idSesionCaja,
      totalVenta: data.totalVenta,
      pagoCon: data.pagoCon,
      cambio: data.cambio,
      metodoPago: data.metodoPago || 'EFECTIVO',
      fechaVenta: now,
      detalles,
    };

    // Construir Transacción Atómica
    const transactItems: any[] = [
      // 1. Insertar registro de venta
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...Keys.venta(data.idSuc, idVenta),
            GSI1PK: `SESION#${data.idSesionCaja}#VENTAS`,
            GSI1SK: now,
            ...ventaItem,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      // 2. Incrementar total de la sesión de caja
      {
        Update: {
          TableName: TABLE_NAME,
          Key: Keys.sesionCaja(data.idSuc, data.idSesionCaja),
          UpdateExpression: 'ADD totalVentas :monto',
          ExpressionAttributeValues: {
            ':monto': data.totalVenta,
          },
        },
      },
      // 3. Decrementar existencias de cada producto
      ...data.items.map((item) => ({
        Update: {
          TableName: TABLE_NAME,
          Key: Keys.producto(data.idSuc, item.idPro),
          UpdateExpression: 'ADD existenciaPro :negCant',
          ConditionExpression: 'attribute_exists(PK) AND existenciaPro >= :cant',
          ExpressionAttributeValues: {
            ':negCant': -item.cantidad,
            ':cant': item.cantidad,
          },
        },
      })),
    ];

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        }),
      );
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw errorFuncional('No se pudo procesar la venta. Verifique que haya existencias suficientes de todos los productos.', 400);
      }
      throw error;
    }

    return ventaItem;
  }

  async listVentas(idSuc = 1, options?: { idSesionCaja?: number }): Promise<VentaEntity[]> {
    if (options?.idSesionCaja) {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :sesionKey',
          ExpressionAttributeValues: {
            ':sesionKey': `SESION#${options.idSesionCaja}#VENTAS`,
          },
          ScanIndexForward: false,
        }),
      );
      return (res.Items || []) as VentaEntity[];
    }

    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'VENTA#',
        },
        ScanIndexForward: false,
      }),
    );
    return (res.Items || []) as VentaEntity[];
  }

  async getVentaById(idVenta: number, idSuc = 1): Promise<VentaEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.venta(idSuc, idVenta),
      }),
    );
    return (res.Item as VentaEntity) || null;
  }
}

export const ventaRepository = new VentaRepository();
