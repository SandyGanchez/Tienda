import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { ProductoParaCarrito } from '../models/carrito';
import { CarritoService } from '../services/carrito.service';
import { ClienteAuthService } from '../services/cliente-auth.service';
import { ImagenesService } from '../services/imagenes.service';

interface ProductoPublico extends ProductoParaCarrito {
  tipoPro: string | null;
  nombreMarca: string | null;
  nombreCat: string | null;
}

@Component({
  selector: 'app-catalogo',
  templateUrl: './catalogo.page.html',
  styleUrls: ['./catalogo.page.scss'],
  standalone: false,
})
export class CatalogoPage implements OnInit {
  productos: ProductoPublico[] = [];
  busqueda = '';
  categoria = 'todas';
  marca = 'todas';
  cargando = true;
  errorCarga = false;

  readonly clienteAuth = inject(ClienteAuthService);
  private readonly carrito = inject(CarritoService);
  private readonly http = inject(HttpClient);
  private readonly imagenes = inject(ImagenesService);
  private readonly toastController = inject(ToastController);

  get nombreCliente(): string | null {
    return this.clienteAuth.sesion?.cliente.nombre?.split(' ')[0] || null;
  }

  get categorias(): string[] {
    return this.valoresUnicos(this.productos.map((producto) => producto.nombreCat));
  }

  get marcas(): string[] {
    return this.valoresUnicos(this.productos.map((producto) => producto.nombreMarca));
  }

  get productosFiltrados(): ProductoPublico[] {
    const termino = this.busqueda.trim().toLocaleLowerCase('es-MX');
    return this.productos.filter((producto) => {
      const coincideTexto =
        !termino ||
        [producto.nombrePro, producto.nombreMarca, producto.nombreCat].some((valor) =>
          valor?.toLocaleLowerCase('es-MX').includes(termino),
        );
      const coincideCategoria = this.categoria === 'todas' || producto.nombreCat === this.categoria;
      const coincideMarca = this.marca === 'todas' || producto.nombreMarca === this.marca;
      return coincideTexto && coincideCategoria && coincideMarca;
    });
  }

  ngOnInit(): void {
    this.cargarProductos();
  }

  cargarProductos(): void {
    this.cargando = true;
    this.errorCarga = false;
    this.http.get<ProductoPublico[]>(`${environment.API_BASE_URL}/public/productos`).subscribe({
      next: (productos) => {
        this.productos = Array.isArray(productos) ? productos : [];
        this.cargando = false;
      },
      error: () => {
        this.productos = [];
        this.errorCarga = true;
        this.cargando = false;
      },
    });
  }

  imagen(ruta: string | null): string | null {
    return this.imagenes.resolver(ruta);
  }

  disponible(producto: ProductoPublico): boolean {
    return Number(producto.existenciaPro ?? 0) > 0;
  }

  seleccionarCategoria(categoria: string): void {
    this.categoria = categoria;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.categoria = 'todas';
    this.marca = 'todas';
  }

  async agregar(producto: ProductoPublico): Promise<void> {
    const agregado = this.carrito.agregar(producto);
    const toast = await this.toastController.create({
      message: agregado
        ? `${producto.nombrePro} se agregó al carrito.`
        : 'No hay más existencia disponible para agregar.',
      duration: 1800,
      position: 'bottom',
      color: agregado ? 'success' : 'warning',
    });
    await toast.present();
  }

  private valoresUnicos(valores: Array<string | null>): string[] {
    return [...new Set(valores.filter((valor): valor is string => Boolean(valor)))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );
  }
}
