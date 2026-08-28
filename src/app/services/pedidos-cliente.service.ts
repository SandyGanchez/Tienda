import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConfiguracionTransferencia, CrearPedidoRequest, PedidoCliente, PedidoClienteResumen } from '../models/pedido-cliente';

@Injectable({ providedIn: 'root' })
export class PedidosClienteService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.API_BASE_URL}/cliente`;

  crearPedido(datos: CrearPedidoRequest): Observable<PedidoCliente> {
    return this.http.post<PedidoCliente>(`${this.url}/pedidos`, datos);
  }

  listar(): Observable<PedidoClienteResumen[]> {
    return this.http.get<PedidoClienteResumen[]>(`${this.url}/pedidos`);
  }

  detalle(idPedido: number): Observable<PedidoCliente> {
    return this.http.get<PedidoCliente>(`${this.url}/pedidos/${idPedido}`);
  }

  cancelar(idPedido: number): Observable<PedidoCliente> {
    return this.http.post<PedidoCliente>(`${this.url}/pedidos/${idPedido}/cancelar`, {});
  }

  subirComprobante(idPedido: number, archivo: File): Observable<PedidoCliente> {
    const datos = new FormData();
    datos.append('comprobante', archivo, archivo.name);
    return this.http.post<PedidoCliente>(`${this.url}/pedidos/${idPedido}/comprobante`, datos);
  }

  obtenerComprobante(idPedido: number): Observable<Blob> {
    return this.http.get(`${this.url}/pedidos/${idPedido}/comprobante`, { responseType: 'blob' });
  }

  obtenerConfiguracionTransferencia(): Observable<{ configuracion: ConfiguracionTransferencia }> {
    return this.http.get<{ configuracion: ConfiguracionTransferencia }>(`${this.url}/configuracion-transferencia`);
  }
}
