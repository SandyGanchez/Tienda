import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { EstadoPedidoCliente, PedidoClienteResumen } from '../models/pedido-cliente';
import { PedidosClienteService } from '../services/pedidos-cliente.service';

@Component({ selector:'app-mis-pedidos',templateUrl:'./mis-pedidos.page.html',styleUrls:['./mis-pedidos.page.scss'],standalone:false })
export class MisPedidosPage implements OnInit {
  pedidos: PedidoClienteResumen[] = [];
  cargando = true;
  private readonly api = inject(PedidosClienteService);
  private readonly toast = inject(ToastController);

  ngOnInit(): void { void this.cargar(); }
  ionViewWillEnter(): void { if (!this.cargando) void this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando = true;
    try { this.pedidos = await firstValueFrom(this.api.listar()); }
    catch (error: unknown) {
      const mensaje = error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : 'No pudimos cargar tus pedidos.';
      const aviso = await this.toast.create({ message:mensaje,color:'danger',duration:3000,position:'top' }); await aviso.present();
    } finally { this.cargando = false; }
  }

  etiqueta(estado: EstadoPedidoCliente): string {
    return ({ PENDIENTE_PAGO:'Pendiente de pago',EN_REVISION:'Pago en revisión',PAGADO:'Pago aprobado',RECHAZADO:'Pago rechazado',
      CANCELADO:'Cancelado',EXPIRADO:'Reserva expirada',LISTO:'Listo para recoger',ENTREGADO:'Entregado' } as Record<EstadoPedidoCliente,string>)[estado];
  }
}
