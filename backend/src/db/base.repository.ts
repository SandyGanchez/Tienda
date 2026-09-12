import {
  GetCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './dynamo.client';
import { errorFuncional } from '../utils/formatters';

export interface IRepository<T> {
  readonly tableName: string;
}

export interface QueryOptions {
  indexName?: string;
  scanIndexForward?: boolean;
  consistentRead?: boolean;
  limit?: number;
}

/**
 * BaseDynamoRepository: Supertipo abstracto para repositorios en AWS DynamoDB Single-Table.
 * Cumple el Principio de Sustitución de Liskov (LSP):
 * - Garantiza un contrato consistente para todas las operaciones de persistencia.
 * - Centraliza el manejo de excepciones de DynamoDB (TransactionCanceledException, ConditionCheckFailed).
 * - Permite sustituir implementaciones de repositorio (DynamoDB, In-Memory para testing, etc.)
 *   sin alterar el comportamiento esperado ni los tipos retornados a los servicios consumidores.
 */
export abstract class BaseDynamoRepository<T> implements IRepository<T> {
  readonly tableName: string;

  constructor(tableName: string = TABLE_NAME) {
    this.tableName = tableName;
  }

  /**
   * Obtiene un registro por su clave primaria (PK y opcional SK).
   */
  protected async getByKey(key: Record<string, any>, consistentRead = true): Promise<T | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
        ConsistentRead: consistentRead,
      }),
    );
    return (res.Item as T) || null;
  }

  /**
   * Consulta registros utilizando expresión de condición de clave (GSI o clave principal).
   */
  protected async queryItems(
    keyCondition: string,
    values: Record<string, any>,
    options?: QueryOptions,
  ): Promise<T[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: options?.indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: values,
        ScanIndexForward: options?.scanIndexForward ?? true,
        ConsistentRead: options?.indexName ? false : (options?.consistentRead ?? true),
        Limit: options?.limit,
      }),
    );
    return (res.Items || []) as T[];
  }

  /**
   * Guarda o reemplaza un ítem completo en DynamoDB.
   */
  protected async putItem(item: Record<string, any>, conditionExpression?: string): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: conditionExpression,
      }),
    );
  }

  /**
   * Elimina un ítem por su clave primaria.
   */
  protected async deleteByKey(key: Record<string, any>): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
      }),
    );
  }

  /**
   * Ejecuta transacciones atómicas de escritura en DynamoDB con manejo consistente
   * de excepciones (LSP: garantiza postcondición de error normalizado).
   */
  protected async executeTransaction(
    transactItems: any[],
    conflictErrorMessage = 'Conflicto de concurrencia o integridad referencial en DynamoDB',
  ): Promise<void> {
    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw errorFuncional(conflictErrorMessage, 409);
      }
      throw error;
    }
  }
}
