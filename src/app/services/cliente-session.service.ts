import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ClienteAuthSession } from '../models/cliente-auth';

@Injectable({ providedIn: 'root' })
export class ClienteSessionStore {
  private readonly clave = 'tienda.cliente.auth.session';
  private readonly subject = new BehaviorSubject<ClienteAuthSession | null>(this.leer());
  readonly sesion$ = this.subject.asObservable();

  get sesion(): ClienteAuthSession | null { return this.subject.value; }
  get token(): string | null { return this.sesion?.token ?? null; }
  guardar(sesion: ClienteAuthSession): void { sessionStorage.setItem(this.clave, JSON.stringify(sesion)); this.subject.next(sesion); }
  limpiar(): void { sessionStorage.removeItem(this.clave); this.subject.next(null); }

  private leer(): ClienteAuthSession | null {
    try {
      const valor = sessionStorage.getItem(this.clave);
      return valor ? JSON.parse(valor) as ClienteAuthSession : null;
    } catch { return null; }
  }
}
