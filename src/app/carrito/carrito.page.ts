import { Component, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ItemCarrito } from '../models/carrito';
import { CarritoService } from '../services/carrito.service';
import { ImagenesService } from '../services/imagenes.service';
import { ClienteAuthService } from '../services/cliente-auth.service';

@Component({
  selector: 'app-carrito',
  templateUrl: './carrito.page.html',
  styleUrls: ['./carrito.page.scss'],
  standalone: false
})
export class CarritoPage {
  readonly carrito = inject(CarritoService);
  private readonly imagenes = inject(ImagenesService);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly clienteAuth = inject(ClienteAuthService);
  private readonly router = inject(Router);

  imagen(ruta: string | null): string | null {
    return this.imagenes.resolver(ruta);
  }

  async incrementar(item: ItemCarrito): Promise<void> {
    if (this.carrito.incrementar(item.idPro)) return;
    const toast = await this.toastController.create({
      message: 'Alcanzaste la existencia disponible de este producto.',
      duration: 1800,
      position: 'bottom',
      color: 'warning'
    });
    await toast.present();
  }

  async confirmarVaciar(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Vaciar carrito',
      message: '¿Quieres quitar todos los productos del carrito?',
      buttons: [
        { text: 'Conservar', role: 'cancel' },
        { text: 'Vaciar', role: 'destructive', handler: () => this.carrito.vaciar() }
      ]
    });
    await alert.present();
  }

  async continuarCompra(): Promise<void> {
    const destino = this.clienteAuth.estaAutenticado()
      ? '/checkout'
      : '/login?returnUrl=%2Fcheckout';
    await this.router.navigateByUrl(destino);
  }
}
