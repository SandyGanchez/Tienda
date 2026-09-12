import { dineroCentavos, errorFuncional } from '../../utils/formatters';

export interface PaymentResult {
  readonly metodoPago: string;
  readonly pagoCon: number;
  readonly cambio: number;
  readonly montoRecibidoDb: number | null;
}

export interface IPaymentStrategy {
  readonly metodo: string;
  validarEntrada(body: any): void;
  validarYCalcular(totalVenta: number, body: any): PaymentResult;
}

/**
 * Estrategia de pago para EFECTIVO:
 * Valida que el monto recibido sea válido y mayor o igual al total,
 * calculando el cambio correspondiente.
 */
export class EfectivoPaymentStrategy implements IPaymentStrategy {
  readonly metodo = 'EFECTIVO';

  validarEntrada(body: any): void {
    const montoRecibidoCentavos = dineroCentavos(body?.montoRecibido);
    if (montoRecibidoCentavos === null || montoRecibidoCentavos < 0) {
      throw errorFuncional('El monto recibido no es válido', 400);
    }
  }

  validarYCalcular(totalVenta: number, body: any): PaymentResult {
    this.validarEntrada(body);

    const totalCentavos = dineroCentavos(totalVenta);
    if (totalCentavos === null || totalCentavos < 0) {
      throw errorFuncional('El total de la venta no es válido', 400);
    }

    const montoRecibidoCentavos = dineroCentavos(body?.montoRecibido)!;
    const cambioCentavos = montoRecibidoCentavos - totalCentavos;
    if (cambioCentavos < 0) {
      throw errorFuncional('El efectivo recibido es insuficiente.', 400);
    }

    const pagoCon = Number((montoRecibidoCentavos / 100).toFixed(2));
    const cambio = Number((cambioCentavos / 100).toFixed(2));
    const montoRecibidoDb = pagoCon;

    return {
      metodoPago: this.metodo,
      pagoCon,
      cambio,
      montoRecibidoDb,
    };
  }
}

/**
 * Estrategia de pago para TARJETA:
 * El pago se realiza por el monto exacto, sin cambio.
 */
export class TarjetaPaymentStrategy implements IPaymentStrategy {
  readonly metodo = 'TARJETA';

  validarEntrada(_body: any): void {}

  validarYCalcular(totalVenta: number, _body: any): PaymentResult {
    return {
      metodoPago: this.metodo,
      pagoCon: Number(totalVenta.toFixed(2)),
      cambio: 0,
      montoRecibidoDb: null,
    };
  }
}

/**
 * Estrategia de pago para TRANSFERENCIA:
 * El pago se liquida por el monto exacto, sin cambio.
 */
export class TransferenciaPaymentStrategy implements IPaymentStrategy {
  readonly metodo = 'TRANSFERENCIA';

  validarEntrada(_body: any): void {}

  validarYCalcular(totalVenta: number, _body: any): PaymentResult {
    return {
      metodoPago: this.metodo,
      pagoCon: Number(totalVenta.toFixed(2)),
      cambio: 0,
      montoRecibidoDb: null,
    };
  }
}

/**
 * Registro de estrategias de pago: Cumple OCP permitiendo registrar nuevos métodos
 * de pago (ej. SPEI, Vales, Stripe, PayPal) sin modificar la clase VentasService.
 */
export class PaymentStrategyRegistry {
  private strategies = new Map<string, IPaymentStrategy>();

  constructor() {
    this.register(new EfectivoPaymentStrategy());
    this.register(new TarjetaPaymentStrategy());
    this.register(new TransferenciaPaymentStrategy());
  }

  register(strategy: IPaymentStrategy): this {
    this.strategies.set(strategy.metodo.toUpperCase(), strategy);
    return this;
  }

  get(metodo: string): IPaymentStrategy {
    const normalizado = String(metodo || '').trim().toUpperCase();
    const strategy = this.strategies.get(normalizado);
    if (!strategy) {
      throw errorFuncional('El método de pago no es válido', 400);
    }
    return strategy;
  }

  has(metodo: string): boolean {
    const normalizado = String(metodo || '').trim().toUpperCase();
    return this.strategies.has(normalizado);
  }

  metodosDisponibles(): string[] {
    return [...this.strategies.keys()];
  }
}

export const defaultPaymentRegistry = new PaymentStrategyRegistry();
