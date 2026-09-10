import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';

export interface CategoriaEntity {
  idCat: number;
  idSuc: number;
  nombreCat: string;
  descripCat?: string | null;
}

export interface MarcaEntity {
  idMarca: number;
  idSuc: number;
  nombreMarca: string;
  descripMarca?: string | null;
}

export interface CargoEntity {
  idCargo: number;
  idSuc: number;
  nombreCargo: string;
  descripcionCargo?: string | null;
}

export class CatalogoRepository {
  // CATEGORÍAS
  async listCategorias(idSuc = 1): Promise<CategoriaEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'CAT#',
        },
      }),
    );
    return ((res.Items || []) as CategoriaEntity[]).sort((a, b) => a.idCat - b.idCat);
  }

  async getCategoriaById(idCat: number, idSuc = 1): Promise<CategoriaEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.categoria(idSuc, idCat),
      }),
    );
    return (res.Item as CategoriaEntity) || null;
  }

  async createCategoria(data: { nombreCat: string; descripCat?: string }, idSuc = 1): Promise<CategoriaEntity> {
    const idCat = await getNextSequence('categoria', 5);
    const item: CategoriaEntity = {
      idCat,
      idSuc,
      nombreCat: data.nombreCat,
      descripCat: data.descripCat || null,
    };
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.categoria(idSuc, idCat),
          GSI1PK: 'CATEGORIAS',
          GSI1SK: item.nombreCat,
          ...item,
        },
      }),
    );
    return item;
  }

  async updateCategoria(idCat: number, data: { nombreCat?: string; descripCat?: string }, idSuc = 1): Promise<CategoriaEntity | null> {
    const existing = await this.getCategoriaById(idCat, idSuc);
    if (!existing) return null;
    const updated: CategoriaEntity = {
      ...existing,
      nombreCat: data.nombreCat ?? existing.nombreCat,
      descripCat: data.descripCat ?? existing.descripCat,
    };
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.categoria(idSuc, idCat),
          GSI1PK: 'CATEGORIAS',
          GSI1SK: updated.nombreCat,
          ...updated,
        },
      }),
    );
    return updated;
  }

  async deleteCategoria(idCat: number, idSuc = 1): Promise<boolean> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: Keys.categoria(idSuc, idCat),
      }),
    );
    return true;
  }

  // MARCAS
  async listMarcas(idSuc = 1): Promise<MarcaEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'MARCA#',
        },
      }),
    );
    return ((res.Items || []) as MarcaEntity[]).sort((a, b) => a.idMarca - b.idMarca);
  }

  async getMarcaById(idMarca: number, idSuc = 1): Promise<MarcaEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.marca(idSuc, idMarca),
      }),
    );
    return (res.Item as MarcaEntity) || null;
  }

  async createMarca(data: { nombreMarca: string; descripMarca?: string }, idSuc = 1): Promise<MarcaEntity> {
    const idMarca = await getNextSequence('marca', 6);
    const item: MarcaEntity = {
      idMarca,
      idSuc,
      nombreMarca: data.nombreMarca,
      descripMarca: data.descripMarca || null,
    };
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.marca(idSuc, idMarca),
          GSI1PK: 'MARCAS',
          GSI1SK: item.nombreMarca,
          ...item,
        },
      }),
    );
    return item;
  }

  async updateMarca(idMarca: number, data: { nombreMarca?: string; descripMarca?: string }, idSuc = 1): Promise<MarcaEntity | null> {
    const existing = await this.getMarcaById(idMarca, idSuc);
    if (!existing) return null;
    const updated: MarcaEntity = {
      ...existing,
      nombreMarca: data.nombreMarca ?? existing.nombreMarca,
      descripMarca: data.descripMarca ?? existing.descripMarca,
    };
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.marca(idSuc, idMarca),
          GSI1PK: 'MARCAS',
          GSI1SK: updated.nombreMarca,
          ...updated,
        },
      }),
    );
    return updated;
  }

  async deleteMarca(idMarca: number, idSuc = 1): Promise<boolean> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: Keys.marca(idSuc, idMarca),
      }),
    );
    return true;
  }

  // CARGOS
  async listCargos(idSuc = 1): Promise<CargoEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'CARGO#',
        },
      }),
    );
    return (res.Items || []) as CargoEntity[];
  }
}

export const catalogoRepository = new CatalogoRepository();
