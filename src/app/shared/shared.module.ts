import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { AdminShellComponent } from './admin-shell/admin-shell.component';

@NgModule({
  declarations: [AdminShellComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [AdminShellComponent]
})
export class SharedModule {}
