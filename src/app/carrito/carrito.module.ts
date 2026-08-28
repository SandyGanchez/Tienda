import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ClienteSharedModule } from '../cliente-shared/cliente-shared.module';
import { CarritoPage } from './carrito.page';

@NgModule({
  declarations: [CarritoPage],
  imports: [CommonModule, IonicModule, ClienteSharedModule, RouterModule.forChild([{ path: '', component: CarritoPage }])]
})
export class CarritoPageModule {}
