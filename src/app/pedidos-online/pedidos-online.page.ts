import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { EstadoPedidoCliente, PedidoAdminResumen } from '../models/pedido-cliente';
import { PedidosAdminService } from '../services/pedidos-admin.service';

@Component({
  selector: 'app-pedidos-online',
  templateUrl: './pedidos-online.page.html',
  styleUrls: ['./pedidos-online.page.scss'],
  standalone: false,
})
export class PedidosOnlinePage implements OnInit {
  pedidos: PedidoAdminResumen[] = [];
  busqueda = '';
  estado = '';
  cargando = true;
  private readonly api = inject(PedidosAdminService);
  private readonly toast = inject(ToastController);
  ngOnInit(): void {
    void this.cargar();
  }
  get filtrados(): PedidoAdminResumen[] {
    const q = this.busqueda.trim().toLocaleLowerCase('es');
    return this.pedidos.filter(
      (p) =>
        (!this.estado || p.estado === this.estado) &&
        (!q ||
          p.folio.toLowerCase().includes(q) ||
          p.cliente.nombre.toLocaleLowerCase('es').includes(q) ||
          p.cliente.correo.toLowerCase().includes(q)),
    );
  }
  contar(estado?: EstadoPedidoCliente): number {
    return estado ? this.pedidos.filter((p) => p.estado === estado).length : this.pedidos.length;
  }
  etiqueta(estado: EstadoPedidoCliente): string {
    return (
      {
        PENDIENTE_PAGO: 'Pendiente de pago',
        EN_REVISION: 'Pago en revisión',
        PAGADO: 'Pago aprobado',
        RECHAZADO: 'Pago rechazado',
        CANCELADO: 'Cancelado',
        EXPIRADO: 'Reserva expirada',
        LISTO: 'Listo para recoger',
        ENTREGADO: 'Entregado',
      } as Record<EstadoPedidoCliente, string>
    )[estado];
  }
  async cargar(event?: CustomEvent): Promise<void> {
    if (!event) this.cargando = true;
    try {
      this.pedidos = await firstValueFrom(this.api.listar());
    } catch (e: unknown) {
      await this.feedback(this.error(e, 'No fue posible consultar los pedidos.'), 'danger');
    } finally {
      this.cargando = false;
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }
  private error(e: unknown, f: string): string {
    return e instanceof HttpErrorResponse && typeof e.error?.message === 'string' ? e.error.message : f;
  }
  private async feedback(message: string, color: 'danger'): Promise<void> {
    const t = await this.toast.create({ message, color, duration: 3200, position: 'top' });
    await t.present();
  }
}
