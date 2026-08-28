export interface Sucursal {
  idSuc: number;
  nombreSuc: string | null;
  descripcionSuc: string | null;
  telefonoSuc: string | null;
  correoSuc: string | null;
  paginaWebSuc: string | null;
  redSocialSuc: string | null;
  logoSuc: string | null;
  idDir: number | null;
  direccion?: string | null;
}

export type SucursalDto = Omit<Sucursal, 'idSuc' | 'logoSuc' | 'idDir' | 'direccion'>;
