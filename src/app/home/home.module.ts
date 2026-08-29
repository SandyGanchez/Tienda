import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HomePage } from './home.page';
import { ConfiguracionTiendaComponent } from './configuracion-tienda.component';
import { SharedModule } from '../shared/shared.module';

import { HomePageRoutingModule } from './home-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, HomePageRoutingModule],
  declarations: [HomePage, ConfiguracionTiendaComponent],
})
export class HomePageModule {}
