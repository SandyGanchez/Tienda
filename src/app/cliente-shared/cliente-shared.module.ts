import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ClienteShellComponent } from './cliente-shell/cliente-shell.component';

@NgModule({ declarations: [ClienteShellComponent], imports: [CommonModule,IonicModule,RouterModule], exports: [ClienteShellComponent] })
export class ClienteSharedModule {}
