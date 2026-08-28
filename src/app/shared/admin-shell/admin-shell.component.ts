import { HttpClient } from '@angular/common/http';
import { Component, inject, Input, OnInit } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { ImagenesService } from '../../services/imagenes.service';

export type AdminSection = 'inicio' | 'productos' | 'categorias' | 'marcas' | 'empleados' | 'cajero' | 'ventas' | 'pedidos-online' | 'configuracion';

interface TiendaMenu {
  nombreSuc: string | null;
  logoSuc: string | null;
}

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.component.html',
  styleUrls: ['./admin-shell.component.scss'],
  standalone: false
})
export class AdminShellComponent implements OnInit {
  @Input({ required: true }) menuId = '';
  @Input({ required: true }) contentId = '';
  @Input({ required: true }) activeSection: AdminSection = 'inicio';

  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly imagenes = inject(ImagenesService);
  tienda: TiendaMenu | null = null;

  ngOnInit(): void {
    this.http.get<TiendaMenu[]>(`${environment.API_BASE_URL}/public/tienda`).subscribe({
      next: tiendas => this.tienda = tiendas.length === 1 ? tiendas[0] : null,
      error: () => undefined
    });
  }

  get nombreTienda(): string {
    return this.tienda?.nombreSuc?.trim() || this.auth.sesion?.empleado.nombreSuc?.trim() || 'Mi tienda';
  }

  get esAdministrador(): boolean { return this.auth.tieneRol('ADMINISTRADOR'); }
  resolverLogo(): string | null { return this.imagenes.resolver(this.tienda?.logoSuc); }
  resolverAvatar(): string | null { return this.imagenes.resolver(this.auth.sesion?.empleado.fotoPerfil); }
}
