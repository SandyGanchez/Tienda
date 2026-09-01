import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CarritoService } from '../../services/carrito.service';
import { ClienteAuthService } from '../../services/cliente-auth.service';
import { ImagenesService } from '../../services/imagenes.service';

interface TiendaPublica {
  nombreSuc: string | null;
  logoSuc: string | null;
}

@Component({
  selector: 'app-cliente-shell',
  templateUrl: './cliente-shell.component.html',
  styleUrls: ['./cliente-shell.component.scss'],
  standalone: false,
})
export class ClienteShellComponent implements OnInit {
  readonly clienteAuth = inject(ClienteAuthService);
  readonly carrito = inject(CarritoService);
  readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly imagenes = inject(ImagenesService);
  tienda: TiendaPublica | null = null;

  ngOnInit(): void {
    this.http.get<TiendaPublica[]>(`${environment.API_BASE_URL}/public/tienda`).subscribe({
      next: (tiendas) => (this.tienda = tiendas.length === 1 ? tiendas[0] : null),
      error: () => undefined,
    });
  }

  get nombreTienda(): string {
    return this.tienda?.nombreSuc?.trim() || 'Mi tienda';
  }
  logo(): string | null {
    return this.imagenes.resolver(this.tienda?.logoSuc);
  }
  avatar(): string | null {
    return this.imagenes.resolver(this.clienteAuth.sesion?.cliente.fotoPerfil);
  }
  isActive(path: string): boolean {
    return this.router.isActive(path, { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
  }
}
