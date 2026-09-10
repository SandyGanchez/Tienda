import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { Keys } from '../dynamo.keys';

export interface SucursalEntity {
  idSuc: number;
  nombreSuc: string;
  descripcionSuc?: string | null;
  telefonoSuc?: string | null;
  correoSuc?: string | null;
  paginaWebSuc?: string | null;
  redSocialSuc?: string | null;
  logoSuc?: string | null;
  direccion?: {
    pais?: string;
    estado?: string;
    municipio?: string;
    colonia?: string;
    calle?: string;
    noExt?: string;
    noInt?: string;
    codPostal?: string;
  };
}

export class SucursalRepository {
  async getById(idSuc = 1): Promise<SucursalEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.sucursal(idSuc),
      }),
    );
    return (res.Item as SucursalEntity) || null;
  }

  async getPublic(idSuc = 1): Promise<Array<{ idSuc: number; nombreSuc: string; descripcionSuc: string | null; logoSuc: string | null }>> {
    const sucursal = await this.getById(idSuc);
    if (!sucursal) return [];
    return [
      {
        idSuc: sucursal.idSuc,
        nombreSuc: sucursal.nombreSuc,
        descripcionSuc: sucursal.descripcionSuc || null,
        logoSuc: sucursal.logoSuc || null,
      },
    ];
  }

  async updateLogo(idSuc: number, logoUrl: string | null): Promise<SucursalEntity | null> {
    const res = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: Keys.sucursal(idSuc),
        UpdateExpression: 'SET logoSuc = :logo',
        ExpressionAttributeValues: { ':logo': logoUrl },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (res.Attributes as SucursalEntity) || null;
  }
}

export const sucursalRepository = new SucursalRepository();
