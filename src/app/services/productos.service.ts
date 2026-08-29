import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CrearProductoDto, Producto, ProductoResponse } from '../models/productos';
import { environment } from '../../environments/environment';
import { ImagenesService } from './imagenes.service';

export interface ProductoPublico {
  encontrado: boolean;
  fuente: string;
  codigoQR: string;
  nombre?: string;
  marca?: string;
  categoria?: string;
  tamano?: string;
  presentacion?: string;
  imagenUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProductosService {
  private readonly apiUrl = `${environment.API_BASE_URL}/productos`;
  private readonly http = inject(HttpClient);
  private readonly imagenes = inject(ImagenesService);

  getProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.apiUrl);
  }

  addProducto(producto: CrearProductoDto): Observable<ProductoResponse> {
    return this.http.post<ProductoResponse>(this.apiUrl, producto);
  }

  updateProducto(id: number, producto: CrearProductoDto): Observable<ProductoResponse> {
    return this.http.put<ProductoResponse>(`${this.apiUrl}/${id}`, producto);
  }

  deleteProducto(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getByQR(codigoQR: string): Observable<Producto | null> {
    return this.http.get<Producto | null>(`${this.apiUrl}/qr/${encodeURIComponent(codigoQR)}`);
  }

  buscarInformacionPublica(codigoQR: string): Observable<ProductoPublico> {
    return this.http.get<ProductoPublico>(`${this.apiUrl}/externo/${encodeURIComponent(codigoQR)}`);
  }

  subirImagen(idPro: number, imagen: Blob, nombreArchivo: string): Observable<ProductoResponse> {
    const formData = new FormData();
    formData.append('imagen', imagen, nombreArchivo);
    return this.http.post<ProductoResponse>(`${this.apiUrl}/${idPro}/imagen`, formData);
  }

  resolverImagenProducto(imagenPro: string | null | undefined): string | null {
    return this.imagenes.resolver(imagenPro);
  }
}
