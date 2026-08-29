export type EstadoCaja = 'ABIERTA' | 'CERRADA';
export type TipoMovimiento = 'INGRESO' | 'RETIRO';
export interface Caja {
  idSesionCaja: number;
  uuidSesionCaja: string;
  idEmp: number;
  idSuc: number;
  fechaHoraApertura: string;
  fondoInicial: number;
  fechaHoraCierre: string | null;
  totalVentas: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalIngresos: number;
  totalRetiros: number;
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferencia: number;
  numeroVentas: number;
  estado: EstadoCaja;
  observaciones: string | null;
  empleado: string;
  nombreSuc: string;
}
export interface MovimientoCaja {
  idMovimientoCaja: number;
  uuidMovimientoCaja: string;
  idSesionCaja: number;
  idEmp: number;
  tipoMovimiento: TipoMovimiento;
  monto: number;
  concepto: string;
  fechaHora: string;
}
