import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ClienteSharedModule } from '../cliente-shared/cliente-shared.module';
import { MisPedidosPage } from './mis-pedidos.page';
import { PedidoDetallePage } from './pedido-detalle.page';
@NgModule({
  declarations: [MisPedidosPage, PedidoDetallePage],
  imports: [
    CommonModule,
    IonicModule,
    ClienteSharedModule,
    RouterModule.forChild([
      { path: '', component: MisPedidosPage },
      { path: ':id', component: PedidoDetallePage },
    ]),
  ],
})
export class MisPedidosPageModule {}
