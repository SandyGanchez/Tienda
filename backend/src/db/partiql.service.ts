import { ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './dynamo.client';

export interface ExecuteSqlOptions {
  consistentRead?: boolean;
  limit?: number;
  nextToken?: string;
}

export interface SqlQueryResult<T = any> {
  items: T[];
  nextToken?: string;
}

/**
 * Servicio PartiQL: Permite ejecutar consultas y mutaciones con sintaxis SQL nativa sobre DynamoDB.
 */
export class PartiQLService {
  /**
   * Ejecuta una consulta SQL tipo SELECT contra la tabla DynamoDB.
   *
   * Ejemplo:
   *   const res = await partiQLService.select<ProductoEntity>(
   *     `SELECT * FROM "${TABLE_NAME}" WHERE PK = ? AND begins_with(SK, ?)`,
   *     ['SUC#1', 'PROD#']
   *   );
   */
  async select<T = any>(
    statement: string,
    parameters: any[] = [],
    options?: ExecuteSqlOptions,
  ): Promise<SqlQueryResult<T>> {
    const res = await docClient.send(
      new ExecuteStatementCommand({
        Statement: statement,
        Parameters: parameters.length > 0 ? parameters : undefined,
        ConsistentRead: options?.consistentRead ?? true,
        Limit: options?.limit,
        NextToken: options?.nextToken,
      }),
    );

    return {
      items: (res.Items || []) as T[],
      nextToken: res.NextToken,
    };
  }

  /**
   * Ejecuta una sentencia SQL de mutación (INSERT, UPDATE, DELETE) sobre DynamoDB.
   */
  async execute(statement: string, parameters: any[] = []): Promise<void> {
    await docClient.send(
      new ExecuteStatementCommand({
        Statement: statement,
        Parameters: parameters.length > 0 ? parameters : undefined,
      }),
    );
  }
}

export const partiQLService = new PartiQLService();
