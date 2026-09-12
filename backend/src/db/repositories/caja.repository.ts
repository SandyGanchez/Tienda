import { getNextSequence, Keys } from '../dynamo.keys';
import { BaseDynamoRepository } from '../base.repository';

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

/**
 * CajaRepository: Repositorio para sesiones de caja en DynamoDB Single-Table.
 * Hereda de BaseDynamoRepository cumpliendo el Principio de Sustitución de Liskov (LSP).
 */
export class CajaRepository extends BaseDynamoRepository<SesionCajaEntity> {
  async getSesionAbierta(idSuc = 1, idEmp?: number): Promise<SesionCajaEntity | null> {
    if (idEmp) {
      const activaRes = await this.getByKey({
        PK: `SUC#${idSuc}`,
        SK: `SESION_ACTIVA#${idEmp}`,
      });
      if ((activaRes as any)?.idSesionCaja) {
        return await this.getSesionById((activaRes as any).idSesionCaja, idSuc);
      }
    }

    const sesiones = await this.queryItems(
      'PK = :pk AND begins_with(SK, :skPrefix)',
      {
        ':pk': `SUC#${idSuc}`,
        ':skPrefix': 'SESION#',
      },
      { consistentRead: true },
    );
    const abierta = sesiones.find((s) => s.estado === 'ABIERTA');
    return abierta || null;
  }

  async getSesionById(idSesionCaja: number, idSuc = 1): Promise<SesionCajaEntity | null> {
    return this.getByKey(Keys.sesionCaja(idSuc, idSesionCaja));
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

    const transactItems = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...Keys.sesionCaja(data.idSuc, idSesionCaja),
            GSI1PK: `EMP#${data.idEmp}#SESIONES`,
            GSI1SK: now,
            ...item,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            PK: `SUC#${data.idSuc}`,
            SK: `SESION_ACTIVA#${data.idEmp}`,
            idSesionCaja,
            idEmp: data.idEmp,
            idSuc: data.idSuc,
            fechaApertura: now,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    await this.executeTransaction(
      transactItems,
      'Ya tienes una sesión de caja abierta en esta sucursal',
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

    const transactItems = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...Keys.sesionCaja(idSuc, idSesionCaja),
            GSI1PK: `EMP#${updated.idEmp}#SESIONES`,
            GSI1SK: updated.fechaApertura,
            ...updated,
          },
        },
      },
      {
        Delete: {
          TableName: this.tableName,
          Key: {
            PK: `SUC#${idSuc}`,
            SK: `SESION_ACTIVA#${updated.idEmp}`,
          },
        },
      },
    ];

    await this.executeTransaction(transactItems);
    return updated;
  }

  async listSesiones(idSuc = 1): Promise<SesionCajaEntity[]> {
    return this.queryItems(
      'PK = :pk AND begins_with(SK, :skPrefix)',
      {
        ':pk': `SUC#${idSuc}`,
        ':skPrefix': 'SESION#',
      },
      { scanIndexForward: false, consistentRead: true },
    );
  }
}

export const cajaRepository = new CajaRepository();
