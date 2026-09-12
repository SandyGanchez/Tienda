export interface ClienteSesion {
  id: string;
  idCliente?: string | number;
  nombre: string;
  apellidoPat: string | null;
  apellidoMat: string | null;
  correo: string;
  fotoPerfil: string | null;
  estadoCliente: boolean;
  fechaRegistro: string;
  ultimoAcceso: string | null;
  rol: 'CLIENTE';
}

export interface ClienteAuthSession {
  token: string;
  cliente: ClienteSesion;
}
