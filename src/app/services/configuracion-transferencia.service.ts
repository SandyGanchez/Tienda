import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConfiguracionTransferenciaAdmin, ConfiguracionTransferenciaDto } from '../models/pedido-cliente';

@Injectable({ providedIn: 'root' })
export class ConfiguracionTransferenciaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.API_BASE_URL}/configuracion/transferencia`;

  obtener(): Observable<{ configuracion: ConfiguracionTransferenciaAdmin | null }> {
    return this.http.get<{ configuracion: ConfiguracionTransferenciaAdmin | null }>(this.url);
  }

  guardar(datos: ConfiguracionTransferenciaDto): Observable<{ configuracion: ConfiguracionTransferenciaAdmin }> {
    return this.http.put<{ configuracion: ConfiguracionTransferenciaAdmin }>(this.url, datos);
  }
}
