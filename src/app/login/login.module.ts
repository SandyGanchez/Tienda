import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { LoginPage } from './login.page';
@NgModule({
  declarations: [LoginPage],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild([{ path: '', component: LoginPage }])],
})
export class LoginPageModule {}
