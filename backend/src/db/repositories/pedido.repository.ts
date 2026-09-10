import { GetCommand, PutCommand, QueryCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';
import { errorFuncional } from '../../utils/formatters';

export interface DetallePedidoItem {
  idPro: number;
  nombrePro: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  imagenPro?: string | null;
}

export interface PedidoClienteEntity {
  idPedido: number;
  idCliente: number;
  idSuc: number;
  clienteNombre?: string;
  clienteCorreo?: string;
  clienteTelefono?: string;
  totalPedido: number;
  estado: 'PENDIENTE' | 'PAGADO' | 'ENVIADO' | 'ENTREGADO' | 'CANCELADO';
  metodoPago: string;
  comprobanteUrl?: string | null;
  fechaCreacion: string;
  fechaActualizacion?: string;
  detalles: DetallePedidoItem[];
}

export class PedidoRepository {
  async createPedido(data: {
    idCliente: number;
    idSuc: number;
    clienteNombre?: string;
    clienteCorreo?: string;
    clienteTelefono?: string;
    totalPedido: number;
    metodoPago?: string;
    comprobanteUrl?: string;
    items: Array<{ idPro: number; cantidad: number; precioUnitario: number; nombrePro?: string; imagenPro?: string }>;
  }): Promise<PedidoClienteEntity> {
    const idPedido = await getNextSequence('pedidoCliente', 1);
    const now = new Date().toISOString();

    const detalles: DetallePedidoItem[] = data.items.map((i) => ({
      idPro: i.idPro,
      nombrePro: i.nombrePro || `Producto #${i.idPro}`,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      subtotal: Number((i.cantidad * i.precioUnitario).toFixed(2)),
      imagenPro: i.imagenPro || null,
    }));

    const pedido: PedidoClienteEntity = {
      idPedido,
      idCliente: data.idCliente,
      idSuc: data.idSuc,
      clienteNombre: data.clienteNombre,
      clienteCorreo: data.clienteCorreo,
      clienteTelefono: data.clienteTelefono,
      totalPedido: data.totalPedido,
      estado: 'PENDIENTE',
      metodoPago: data.metodoPago || 'TRANSFERENCIA',
      comprobanteUrl: data.comprobanteUrl || null,
      fechaCreacion: now,
      detalles,
    };

    const transactItems: any[] = [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...Keys.pedidoCliente(data.idCliente, idPedido),
            GSI1PK: `SUC#${data.idSuc}#PEDIDOS`,
            GSI1SK: `${pedido.estado}#${now}`,
            ...pedido,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
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
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return pedido;
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw errorFuncional('No se pudo procesar el pedido. Puede que el stock de algún producto se haya agotado o sea insuficiente.', 400);
      }
      throw error;
    }
  }

  async listPedidosCliente(idCliente: number): Promise<PedidoClienteEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `CLI#${idCliente}`,
          ':skPrefix': 'PEDIDO#',
        },
        ScanIndexForward: false,
      }),
    );
    return (res.Items || []) as PedidoClienteEntity[];
  }

  async listPedidosAdmin(idSuc = 1): Promise<PedidoClienteEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :sucKey',
        ExpressionAttributeValues: {
          ':sucKey': `SUC#${idSuc}#PEDIDOS`,
        },
        ScanIndexForward: false,
      }),
    );
    return (res.Items || []) as PedidoClienteEntity[];
  }

  async getPedidoById(idCliente: number, idPedido: number): Promise<PedidoClienteEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.pedidoCliente(idCliente, idPedido),
      }),
    );
    return (res.Item as PedidoClienteEntity) || null;
  }

  async updateEstado(
    idCliente: number,
    idPedido: number,
    nuevoEstado: 'PENDIENTE' | 'PAGADO' | 'ENVIADO' | 'ENTREGADO' | 'CANCELADO',
  ): Promise<PedidoClienteEntity | null> {
    const existing = await this.getPedidoById(idCliente, idPedido);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: PedidoClienteEntity = {
      ...existing,
      estado: nuevoEstado,
      fechaActualizacion: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.pedidoCliente(idCliente, idPedido),
          GSI1PK: `SUC#${existing.idSuc}#PEDIDOS`,
          GSI1SK: `${nuevoEstado}#${existing.fechaCreacion}`,
          ...updated,
        },
      }),
    );

    return updated;
  }
}

export const pedidoRepository = new PedidoRepository();
