import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../shared/shared.module';
import { DetalleVentaPage } from './detalle-venta.page';
import { HistorialVentasPage } from './historial-ventas.page';
@NgModule({
  declarations: [HistorialVentasPage, DetalleVentaPage],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([
      { path: '', component: HistorialVentasPage },
      { path: ':id', component: DetalleVentaPage },
    ]),
  ],
})
export class VentasPageModule {}
