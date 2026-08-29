import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ClienteSharedModule } from '../cliente-shared/cliente-shared.module';
import { CheckoutPage } from './checkout.page';

@NgModule({
  declarations: [CheckoutPage],
  imports: [
    CommonModule,
    IonicModule,
    ClienteSharedModule,
    RouterModule.forChild([{ path: '', component: CheckoutPage }]),
  ],
})
export class CheckoutPageModule {}
