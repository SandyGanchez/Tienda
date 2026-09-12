import { encodeId } from '../utils/formatters';

export const toEmpleadoDto = (empleado: any) => {
  if (!empleado) return null;
  const encodedId = encodeId(empleado.idEmp);
  return {
    id: encodedId,
    idEmp: encodedId,
    nombreCompleto: [empleado.nombreEmp, empleado.apellidoPatEmp, empleado.apellidoMatEmp].filter(Boolean).join(' '),
    nombre: empleado.nombreEmp,
    apellidoPat: empleado.apellidoPatEmp,
    apellidoMat: empleado.apellidoMatEmp,
    correo: empleado.correoEmp || empleado.correo,
    telefono: empleado.telefono,
    fechaIngreso: empleado.fechaIngreso,
    fotoPerfil: empleado.fotoPerfil,
    estado: Boolean(empleado.estadoEmp),
    estadoEmp: Boolean(empleado.estadoEmp),
    cargo: empleado.cargo?.nombreCargo || empleado.cargo || null,
    sucursal: empleado.cargo?.sucursal?.nombreSuc || empleado.nombreSuc || null,
    nombreSuc: empleado.cargo?.sucursal?.nombreSuc || empleado.nombreSuc || null,
  };
};

export const toClienteDto = (cliente: any) => {
  if (!cliente) return null;
  const encodedId = encodeId(cliente.idCliente);
  return {
    id: encodedId,
    idCliente: encodedId,
    nombreCompleto: [cliente.nombreCliente, cliente.apellidoPatCliente, cliente.apellidoMatCliente].filter(Boolean).join(' '),
    nombre: cliente.nombreCliente,
    apellidoPat: cliente.apellidoPatCliente,
    apellidoMat: cliente.apellidoMatCliente,
    correo: cliente.correoCliente || cliente.correo,
    fotoPerfil: cliente.fotoPerfil,
    estado: Boolean(cliente.estadoCliente),
    fechaRegistro: cliente.fechaRegistro,
    ultimoAcceso: cliente.ultimoAcceso,
  };
};
