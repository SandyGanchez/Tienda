import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { EstadoPedidoCliente, PedidoAdminDetalle } from '../models/pedido-cliente';
import { ImagenesService } from '../services/imagenes.service';
import { PedidosAdminService } from '../services/pedidos-admin.service';

@Component({
  selector: 'app-pedido-online-detalle',
  templateUrl: './pedido-online-detalle.page.html',
  styleUrls: ['./pedido-online-detalle.page.scss'],
  standalone: false,
})
export class PedidoOnlineDetallePage implements OnInit {
  pedido: PedidoAdminDetalle | null = null;
  cargando = true;
  accionEnCurso: string | null = null;
  private readonly api = inject(PedidosAdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alert = inject(AlertController);
  private readonly toast = inject(ToastController);
  private readonly imagenes = inject(ImagenesService);
  ngOnInit(): void {
    void this.cargar();
  }
  imagen(ruta: string | null): string | null {
    return this.imagenes.resolver(ruta);
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
  async confirmarAprobacion(): Promise<void> {
    if (!this.pedido || this.accionEnCurso) return;
    const a = await this.alert.create({
      header: 'Aprobar pago',
      message: 'Confirma que verificaste el comprobante y el monto recibido. Esta acción registrará la venta.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Aprobar',
          handler: () => {
            void this.ejecutar('aprobar');
          },
        },
      ],
    });
    await a.present();
  }
  async solicitarRechazo(): Promise<void> {
    if (!this.pedido || this.accionEnCurso) return;
    const a = await this.alert.create({
      header: 'Rechazar pago',
      message: 'El motivo se mostrará al cliente y el inventario reservado será restaurado.',
      inputs: [
        {
          name: 'motivo',
          type: 'textarea',
          placeholder: 'Motivo del rechazo',
          attributes: { minlength: 3, maxlength: 255 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Rechazar',
          role: 'destructive',
          handler: (data) => {
            const motivo = String(data.motivo || '').trim();
            if (motivo.length < 3 || motivo.length > 255) {
              void this.feedback('El motivo debe tener entre 3 y 255 caracteres.', 'warning');
              return false;
            }
            void this.ejecutar('rechazar', motivo);
            return true;
          },
        },
      ],
    });
    await a.present();
  }
  async ejecutar(accion: 'aprobar' | 'rechazar' | 'listo' | 'entregar', motivo = ''): Promise<void> {
    if (!this.pedido || this.accionEnCurso) return;
    this.accionEnCurso = accion;
    try {
      const id = this.pedido.id;
      this.pedido = await firstValueFrom(
        accion === 'aprobar'
          ? this.api.aprobar(id)
          : accion === 'rechazar'
            ? this.api.rechazar(id, motivo)
            : accion === 'listo'
              ? this.api.listo(id)
              : this.api.entregar(id),
      );
      await this.feedback(
        accion === 'aprobar'
          ? 'Pago aprobado y venta registrada.'
          : accion === 'rechazar'
            ? 'Pago rechazado e inventario restaurado.'
            : accion === 'listo'
              ? 'Pedido marcado como listo.'
              : 'Pedido marcado como entregado.',
        'success',
      );
    } catch (e: unknown) {
      await this.feedback(this.error(e, 'No fue posible actualizar el pedido.'), 'danger');
      await this.cargar();
    } finally {
      this.accionEnCurso = null;
    }
  }
  async verComprobante(): Promise<void> {
    if (!this.pedido?.comprobante) return;
    const ventana = window.open('', '_blank');
    if (ventana) ventana.opener = null;
    try {
      const blob = await firstValueFrom(this.api.comprobante(this.pedido.id));
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error('COMPROBANTE_VACIO');
      const blobUrl = URL.createObjectURL(blob);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
      if (ventana && !ventana.closed) ventana.location.href = blobUrl;
      else {
        const enlace = document.createElement('a');
        enlace.href = blobUrl;
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.click();
      }
    } catch (e: unknown) {
      if (ventana && !ventana.closed) ventana.close();
      await this.feedback(
        e instanceof Error && e.message === 'COMPROBANTE_VACIO'
          ? 'El comprobante recibido está vacío.'
          : this.error(e, 'No fue posible abrir el comprobante.'),
        'danger',
      );
    }
  }
  private async cargar(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      await this.router.navigateByUrl('/pedidos-online');
      return;
    }
    this.cargando = true;
    try {
      this.pedido = await firstValueFrom(this.api.detalle(id));
    } catch (e: unknown) {
      await this.feedback(this.error(e, 'No fue posible cargar el pedido.'), 'danger');
      await this.router.navigateByUrl('/pedidos-online');
    } finally {
      this.cargando = false;
    }
  }
  private error(e: unknown, f: string): string {
    return e instanceof HttpErrorResponse && typeof e.error?.message === 'string' ? e.error.message : f;
  }
  private async feedback(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    const t = await this.toast.create({ message, color, duration: 3400, position: 'top' });
    await t.present();
  }
}
