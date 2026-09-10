import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamo.client';
import { getNextSequence, Keys } from '../dynamo.keys';

export interface EmpleadoEntity {
  idEmp: number;
  idSuc: number;
  idCargo: number;
  nombreEmp: string;
  apellidoPatEmp: string;
  apellidoMatEmp?: string | null;
  correoEmp: string;
  contrasenaHash: string;
  estadoEmp: boolean;
  telefono?: string | null;
  cargoNombre?: string;
  cargo?: string;
  fotoPerfil?: string | null;
  nombreSuc?: string;
}

export interface ClienteEntity {
  idCliente: number;
  nombreCliente: string;
  apellidoPatCliente?: string | null;
  apellidoMatCliente?: string | null;
  correoCliente: string;
  googleSub?: string | null;
  fotoPerfil?: string | null;
  estadoCliente: boolean;
  telefono?: string | null;
}

export class AuthRepository {
  // EMPLEADO
  async findEmpleadoByEmail(correo: string): Promise<EmpleadoEntity | null> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :emailKey',
        ExpressionAttributeValues: {
          ':emailKey': `EMAIL#${correo.toLowerCase().trim()}`,
        },
      }),
    );
    if (!res.Items || res.Items.length === 0) return null;
    return res.Items[0] as EmpleadoEntity;
  }

  async findEmpleadoById(idEmp: number): Promise<EmpleadoEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.empleado(idEmp),
      }),
    );
    return (res.Item as EmpleadoEntity) || null;
  }

  // CLIENTE
  async findClienteByGoogleSub(googleSub: string): Promise<ClienteEntity | null> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :subKey',
        ExpressionAttributeValues: {
          ':subKey': `GOOGLE#${googleSub}`,
        },
      }),
    );
    if (!res.Items || res.Items.length === 0) return null;
    return res.Items[0] as ClienteEntity;
  }

  async findClienteByEmail(correo: string): Promise<ClienteEntity | null> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :emailKey',
        ExpressionAttributeValues: {
          ':emailKey': `EMAIL#${correo.toLowerCase().trim()}`,
        },
      }),
    );
    if (!res.Items || res.Items.length === 0) return null;
    return res.Items[0] as ClienteEntity;
  }

  async findClienteById(idCliente: number): Promise<ClienteEntity | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: Keys.cliente(idCliente),
      }),
    );
    return (res.Item as ClienteEntity) || null;
  }

  async createCliente(data: {
    nombreCliente: string;
    apellidoPatCliente?: string;
    correoCliente: string;
    googleSub?: string;
    fotoPerfil?: string;
    telefono?: string;
  }): Promise<ClienteEntity> {
    const idCliente = await getNextSequence('cliente', 4);
    const item: ClienteEntity = {
      idCliente,
      nombreCliente: data.nombreCliente,
      apellidoPatCliente: data.apellidoPatCliente || '',
      correoCliente: data.correoCliente,
      googleSub: data.googleSub || null,
      fotoPerfil: data.fotoPerfil || null,
      telefono: data.telefono || null,
      estadoCliente: true,
    };

    const gsi2pk = item.googleSub ? `GOOGLE#${item.googleSub}` : `EMAIL#${item.correoCliente.toLowerCase()}`;

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...Keys.cliente(idCliente),
          GSI1PK: 'CLIENTES',
          GSI1SK: `${item.nombreCliente} ${item.apellidoPatCliente || ''}`.trim(),
          GSI2PK: gsi2pk,
          GSI2SK: `CLI#${idCliente}`,
          ...item,
        },
      }),
    );
    return item;
  }
}

export const authRepository = new AuthRepository();
