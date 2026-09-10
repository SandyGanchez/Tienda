import { DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';
import { errorFuncional } from '../../utils/formatters';

export interface ProductoEntity {
  idPro: number;
  idSuc: number;
  nombrePro: string;
  precioVentaPro: number;
  costoPro: number;
  existenciaPro: number;
  stockMinimoPro: number;
  tamanoPro?: string | null;
  presentacionPro?: string | null;
  tipoPro?: string | null;
  codigoQR?: string | null;
  skuPro?: string | null;
  imagenPro?: string | null;
  activoPro: boolean;
  idMarca?: number | null;
  marcaNombre?: string | null;
  idCat?: number | null;
  categoriaNombre?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class ProductoRepository {
  async listProductos(idSuc = 1, options?: { idCat?: number; soloActivos?: boolean }): Promise<ProductoEntity[]> {
    let items: ProductoEntity[] = [];

    if (options?.idCat) {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :catKey',
          ExpressionAttributeValues: {
            ':catKey': `CAT#${options.idCat}#PRODS`,
          },
        }),
      );
      items = (res.Items || []) as ProductoEntity[];
    } else {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `SUC#${idSuc}`,
            ':skPrefix': 'PROD#',
          },
          ConsistentRead: true,
        }),
      );
      items = (res.Items || []) as ProductoEntity[];
    }

    if (options?.soloActivos) {
      items = items.filter((p) => p.activoPro !== false);
    }

    return items.sort((a, b) => a.nombrePro.localeCompare(b.nombrePro));
  }

  async getProductoById(idPro: number, idSuc = 1): Promise<ProductoEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.producto(idSuc, idPro),
        ConsistentRead: true,
      }),
    );
    return (res.Item as ProductoEntity) || null;
  }

  async findByCodigoQR(codigoQR: string): Promise<ProductoEntity | null> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :qrKey',
        ExpressionAttributeValues: {
          ':qrKey': `QR#${codigoQR.trim()}`,
        },
      }),
    );
    if (!res.Items || res.Items.length === 0) return null;
    return res.Items[0] as ProductoEntity;
  }

  async createProducto(data: Omit<ProductoEntity, 'idPro'>): Promise<ProductoEntity> {
    const idPro = await getNextSequence('producto', 6);
    const now = new Date().toISOString();
    const item: ProductoEntity = {
      ...data,
      idPro,
      activoPro: data.activoPro !== false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const transactItems: any[] = [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...Keys.producto(item.idSuc, idPro),
            GSI1PK: `CAT#${item.idCat || 0}#PRODS`,
            GSI1SK: String(item.precioVentaPro).padStart(8, '0'),
            ...(item.codigoQR && { GSI2PK: `QR#${item.codigoQR}`, GSI2SK: `PROD#${idPro}` }),
            ...item,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    // SQL FOREIGN KEY: Validar que la categoría exista
    if (item.idCat) {
      transactItems.push({
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: Keys.categoria(item.idSuc, item.idCat),
          ConditionExpression: 'attribute_exists(PK)',
        },
      });
    }

    // SQL FOREIGN KEY: Validar que la marca exista
    if (item.idMarca) {
      transactItems.push({
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: Keys.marca(item.idSuc, item.idMarca),
          ConditionExpression: 'attribute_exists(PK)',
        },
      });
    }

    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return item;
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw errorFuncional(
          'Violación de clave foránea: La categoría o marca seleccionada no existe en la base de datos',
          409,
        );
      }
      throw error;
    }
  }

  async updateProducto(idPro: number, data: Partial<ProductoEntity>, idSuc = 1): Promise<ProductoEntity | null> {
    const existing = await this.getProductoById(idPro, idSuc);
    if (!existing) return null;

    const now = new Date().toISOString();
    const currentVersion = existing.version || 1;
    const updated: ProductoEntity = {
      ...existing,
      ...data,
      idPro,
      idSuc,
      version: currentVersion + 1,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };

    const transactItems: any[] = [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...Keys.producto(idSuc, idPro),
            GSI1PK: `CAT#${updated.idCat || 0}#PRODS`,
            GSI1SK: String(updated.precioVentaPro).padStart(8, '0'),
            ...(updated.codigoQR && { GSI2PK: `QR#${updated.codigoQR}`, GSI2SK: `PROD#${idPro}` }),
            ...updated,
          },
          // SQL Optimistic Locking: Verifica que la versión coincida para evitar Lost Updates
          ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(version) OR version = :ver)',
          ExpressionAttributeValues: {
            ':ver': currentVersion,
          },
        },
      },
    ];

    // SQL FOREIGN KEY: Validar categoría si existe
    if (updated.idCat) {
      transactItems.push({
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: Keys.categoria(idSuc, updated.idCat),
          ConditionExpression: 'attribute_exists(PK)',
        },
      });
    }

    // SQL FOREIGN KEY: Validar marca si existe
    if (updated.idMarca) {
      transactItems.push({
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: Keys.marca(idSuc, updated.idMarca),
          ConditionExpression: 'attribute_exists(PK)',
        },
      });
    }

    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return updated;
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw errorFuncional(
          'Conflicto de concurrencia o integridad referencial: El producto fue modificado por otro usuario o la categoría/marca no existe',
          409,
        );
      }
      throw error;
    }
  }

  async deleteProducto(idPro: number, idSuc = 1): Promise<boolean> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: Keys.producto(idSuc, idPro),
      }),
    );
    return true;
  }
}

export const productoRepository = new ProductoRepository();
