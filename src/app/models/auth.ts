export type Rol = 'ADMINISTRADOR' | 'CAJERO';

export interface EmpleadoSesion {
  idEmp: number;
  nombre: string;
  nombreEmp: string | null;
  apellidoPatEmp: string | null;
  apellidoMatEmp: string | null;
  correo: string;
  telefono: string | null;
  fechaIngreso: string | null;
  fotoPerfil: string | null;
  idCargo: number;
  cargo: Rol;
  idSuc: number;
  nombreSuc: string | null;
  estadoEmp: boolean;
}

export interface AuthSession {
  token: string;
  empleado: EmpleadoSesion;
}
