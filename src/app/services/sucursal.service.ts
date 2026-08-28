import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Sucursal, SucursalDto } from '../models/sucursal';
import { ImagenesService } from './imagenes.service';

@Injectable({ providedIn: 'root' })
export class SucursalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.API_BASE_URL}/sucursal`;
  private readonly imagenes = inject(ImagenesService);

  obtenerSucursales(): Observable<Sucursal[]> {
    return this.http.get<Sucursal[]>(this.apiUrl);
  }

  crearSucursal(datos: SucursalDto): Observable<Sucursal> {
    return this.http.post<Sucursal>(this.apiUrl, datos);
  }

  actualizarSucursal(idSuc: number, datos: SucursalDto): Observable<Sucursal> {
    return this.http.put<Sucursal>(`${this.apiUrl}/${idSuc}`, datos);
  }

  subirLogo(idSuc: number, imagen: Blob, nombre: string): Observable<Sucursal> {
    const formData = new FormData();
    formData.append('logo', imagen, nombre);
    return this.http.post<Sucursal>(`${this.apiUrl}/${idSuc}/logo`, formData);
  }

  quitarLogo(idSuc: number): Observable<Sucursal> {
    return this.http.delete<Sucursal>(`${this.apiUrl}/${idSuc}/logo`);
  }

  resolverImagen(ruta: string | null | undefined): string | null {
    return this.imagenes.resolver(ruta);
  }
}
