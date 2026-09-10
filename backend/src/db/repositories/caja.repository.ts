import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';

export interface SesionCajaEntity {
  idSesionCaja: number;
  idSuc: number;
  idEmp: number;
  empleadoNombre?: string;
  estado: 'ABIERTA' | 'CERRADA';
  fondoInicial: number;
  totalVentas: number;
  fechaApertura: string;
  fechaCierre?: string | null;
  montoReal?: number | null;
  diferencia?: number | null;
  observaciones?: string | null;
}

export class CajaRepository {
  async getSesionAbierta(idSuc = 1): Promise<SesionCajaEntity | null> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'SESION#',
        },
      }),
    );
    const sesiones = (res.Items || []) as SesionCajaEntity[];
    const abierta = sesiones.find((s) => s.estado === 'ABIERTA');
    return abierta || null;
  }

  async getSesionById(idSesionCaja: number, idSuc = 1): Promise<SesionCajaEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.sesionCaja(idSuc, idSesionCaja),
      }),
    );
    return (res.Item as SesionCajaEntity) || null;
  }

  async abrirSesion(data: { idSuc: number; idEmp: number; fondoInicial: number; empleadoNombre?: string }): Promise<SesionCajaEntity> {
    const idSesionCaja = await getNextSequence('sesionCaja', 4);
    const now = new Date().toISOString();
    const item: SesionCajaEntity = {
      idSesionCaja,
      idSuc: data.idSuc,
      idEmp: data.idEmp,
      empleadoNombre: data.empleadoNombre,
      estado: 'ABIERTA',
      fondoInicial: data.fondoInicial,
      totalVentas: 0,
      fechaApertura: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.sesionCaja(data.idSuc, idSesionCaja),
          GSI1PK: `EMP#${data.idEmp}#SESIONES`,
          GSI1SK: now,
          ...item,
        },
      }),
    );
    return item;
  }

  async cerrarSesion(
    idSesionCaja: number,
    data: { montoReal: number; diferencia: number; observaciones?: string },
    idSuc = 1,
  ): Promise<SesionCajaEntity | null> {
    const existing = await this.getSesionById(idSesionCaja, idSuc);
    if (!existing) return null;

    const updated: SesionCajaEntity = {
      ...existing,
      estado: 'CERRADA',
      fechaCierre: new Date().toISOString(),
      montoReal: data.montoReal,
      diferencia: data.diferencia,
      observaciones: data.observaciones || null,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.sesionCaja(idSuc, idSesionCaja),
          GSI1PK: `EMP#${updated.idEmp}#SESIONES`,
          GSI1SK: updated.fechaApertura,
          ...updated,
        },
      }),
    );
    return updated;
  }

  async listSesiones(idSuc = 1): Promise<SesionCajaEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `SUC#${idSuc}`,
          ':skPrefix': 'SESION#',
        },
        ScanIndexForward: false,
      }),
    );
    return (res.Items || []) as SesionCajaEntity[];
  }
}

export const cajaRepository = new CajaRepository();
