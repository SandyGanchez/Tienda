import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';
import { EmpleadoEntity } from './auth.repository';

export class EmpleadoRepository {
  async listEmpleados(idSuc = 1): Promise<EmpleadoEntity[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :sucKey',
        ExpressionAttributeValues: {
          ':sucKey': `SUC#${idSuc}#EMPLEADOS`,
        },
      }),
    );
    return ((res.Items || []) as EmpleadoEntity[]).sort((a, b) => a.idEmp - b.idEmp);
  }

  async getEmpleadoById(idEmp: number): Promise<EmpleadoEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.empleado(idEmp),
      }),
    );
    return (res.Item as EmpleadoEntity) || null;
  }

  async createEmpleado(data: Omit<EmpleadoEntity, 'idEmp'>): Promise<EmpleadoEntity> {
    const idEmp = await getNextSequence('empleado', 4);
    const item: EmpleadoEntity = {
      ...data,
      idEmp,
      estadoEmp: data.estadoEmp !== false,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.empleado(idEmp),
          GSI1PK: `SUC#${item.idSuc}#EMPLEADOS`,
          GSI1SK: `${item.apellidoPatEmp}#${item.nombreEmp}`,
          GSI2PK: `EMAIL#${item.correoEmp.toLowerCase().trim()}`,
          GSI2SK: `EMP#${idEmp}`,
          ...item,
        },
      }),
    );

    return item;
  }

  async updateEmpleado(idEmp: number, data: Partial<EmpleadoEntity>): Promise<EmpleadoEntity | null> {
    const existing = await this.getEmpleadoById(idEmp);
    if (!existing) return null;

    const updated: EmpleadoEntity = {
      ...existing,
      ...data,
      idEmp,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.empleado(idEmp),
          GSI1PK: `SUC#${updated.idSuc}#EMPLEADOS`,
          GSI1SK: `${updated.apellidoPatEmp}#${updated.nombreEmp}`,
          GSI2PK: `EMAIL#${updated.correoEmp.toLowerCase().trim()}`,
          GSI2SK: `EMP#${idEmp}`,
          ...updated,
        },
      }),
    );

    return updated;
  }

  async deleteEmpleado(idEmp: number): Promise<boolean> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: Keys.empleado(idEmp),
      }),
    );
    return true;
  }
}

export const empleadoRepository = new EmpleadoRepository();
