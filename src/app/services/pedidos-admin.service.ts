import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PedidoAdminDetalle, PedidoAdminResumen } from '../models/pedido-cliente';

@Injectable({ providedIn: 'root' })
export class PedidosAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.API_BASE_URL}/admin/pedidos`;

  listar(): Observable<PedidoAdminResumen[]> {
    return this.http.get<PedidoAdminResumen[]>(this.url);
  }
  detalle(id: number): Observable<PedidoAdminDetalle> {
    return this.http.get<PedidoAdminDetalle>(`${this.url}/${id}`);
  }
  comprobante(id: number): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/comprobante`, { responseType: 'blob' });
  }
  aprobar(id: number): Observable<PedidoAdminDetalle> {
    return this.http.post<PedidoAdminDetalle>(`${this.url}/${id}/aprobar`, {});
  }
  rechazar(id: number, motivo: string): Observable<PedidoAdminDetalle> {
    return this.http.post<PedidoAdminDetalle>(`${this.url}/${id}/rechazar`, { motivo });
  }
  listo(id: number): Observable<PedidoAdminDetalle> {
    return this.http.post<PedidoAdminDetalle>(`${this.url}/${id}/listo`, {});
  }
  entregar(id: number): Observable<PedidoAdminDetalle> {
    return this.http.post<PedidoAdminDetalle>(`${this.url}/${id}/entregar`, {});
  }
}
