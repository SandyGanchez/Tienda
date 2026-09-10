import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { Keys } from '../dynamo.keys';
import { errorFuncional } from '../../utils/formatters';

export interface ConfiguracionTransferenciaEntity {
  idConfiguracion: number;
  idSuc: number;
  banco: string;
  titular: string;
  clabe?: string | null;
  numeroCuenta?: string | null;
  instrucciones?: string | null;
  activo: boolean;
  fechaActualizacion: string;
  version?: number;
}

export class ConfiguracionRepository {
  async getConfiguracion(idSuc = 1): Promise<ConfiguracionTransferenciaEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.configuracion(idSuc),
        ConsistentRead: true,
      }),
    );
    return (res.Item as ConfiguracionTransferenciaEntity) || null;
  }

  async updateConfiguracion(
    idSuc = 1,
    data: Partial<Omit<ConfiguracionTransferenciaEntity, 'idConfiguracion' | 'idSuc'>>,
  ): Promise<ConfiguracionTransferenciaEntity> {
    const existing = await this.getConfiguracion(idSuc);
    const currentVersion = existing?.version || 1;
    const updated: ConfiguracionTransferenciaEntity = {
      idConfiguracion: existing?.idConfiguracion || 1,
      idSuc,
      banco: data.banco ?? existing?.banco ?? '',
      titular: data.titular ?? existing?.titular ?? '',
      clabe: data.clabe ?? existing?.clabe ?? '',
      numeroCuenta: data.numeroCuenta ?? existing?.numeroCuenta ?? '',
      instrucciones: data.instrucciones ?? existing?.instrucciones ?? null,
      activo: data.activo ?? existing?.activo ?? true,
      fechaActualizacion: new Date().toISOString(),
      version: currentVersion + 1,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...Keys.configuracion(idSuc),
            ...updated,
          },
          ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(version) OR version = :ver)',
          ExpressionAttributeValues: {
            ':ver': currentVersion,
          },
        }),
      );
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw errorFuncional('Conflicto de concurrencia: La configuración fue actualizada por otro usuario.', 409);
      }
      throw error;
    }
    return updated;
  }
}

export const configuracionRepository = new ConfiguracionRepository();
