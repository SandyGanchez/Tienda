import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../shared/shared.module';
import { PedidoOnlineDetallePage } from './pedido-online-detalle.page';
import { PedidosOnlinePage } from './pedidos-online.page';

@NgModule({
  declarations: [PedidosOnlinePage, PedidoOnlineDetallePage],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([
      { path: '', component: PedidosOnlinePage },
      { path: ':id', component: PedidoOnlineDetallePage },
    ]),
  ],
})
export class PedidosOnlinePageModule {}
