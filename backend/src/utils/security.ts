import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ClienteSesion, EmpleadoSesion, JwtPayloadCliente, JwtPayloadEmpleado } from '../types/auth.types';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function emitirSesionEmpleado(empleado: { idEmp: number }): string {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET no está configurado');
  return jwt.sign({ sub: String(empleado.idEmp), tipo: 'EMPLEADO' }, env.JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'tienda-api',
  });
}

export function emitirSesionCliente(cliente: { idCliente: number }): string {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET no está configurado');
  return jwt.sign({ sub: String(cliente.idCliente), tipo: 'CLIENTE' }, env.JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'tienda-api',
  });
}

export function verificarToken(token: string): JwtPayloadEmpleado | JwtPayloadCliente {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET no está configurado');
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'tienda-api' }) as JwtPayloadEmpleado | JwtPayloadCliente;
}

export function empleadoSeguro(empleado: any): EmpleadoSesion {
  return {
    idEmp: Number(empleado.idEmp),
    nombre: [empleado.nombreEmp, empleado.apellidoPatEmp, empleado.apellidoMatEmp].filter(Boolean).join(' '),
    nombreEmp: empleado.nombreEmp || '',
    apellidoPatEmp: empleado.apellidoPatEmp || null,
    apellidoMatEmp: empleado.apellidoMatEmp || null,
    correo: empleado.correoEmp || empleado.correo || '',
    telefono: empleado.telefono || null,
    fechaIngreso: empleado.fechaIngreso ? new Date(empleado.fechaIngreso) : null,
    fotoPerfil: empleado.fotoPerfil || null,
    idCargo: Number(empleado.idCargo),
    cargo: empleado.cargo?.nombreCargo || empleado.cargo || null,
    idSuc: Number(empleado.cargo?.idSuc || empleado.idSuc || 1),
    nombreSuc: empleado.cargo?.sucursal?.nombreSuc || empleado.nombreSuc || null,
    estadoEmp: Boolean(empleado.estadoEmp),
  };
}

export function clienteSeguro(cliente: any): ClienteSesion {
  return {
    idCliente: Number(cliente.idCliente),
    nombre: cliente.nombreCliente || '',
    apellidoPat: cliente.apellidoPatCliente || null,
    apellidoMat: cliente.apellidoMatCliente || null,
    correo: cliente.correoCliente || '',
    fotoPerfil: cliente.fotoPerfil || null,
    estadoCliente: Boolean(cliente.estadoCliente),
    fechaRegistro: cliente.fechaRegistro ? new Date(cliente.fechaRegistro) : null,
    ultimoAcceso: cliente.ultimoAcceso ? new Date(cliente.ultimoAcceso) : null,
    rol: 'CLIENTE',
  };
}
