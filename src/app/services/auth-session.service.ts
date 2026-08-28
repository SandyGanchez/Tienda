import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthSession } from '../models/auth';

@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly clave = 'tienda.auth.session';
  private readonly subject = new BehaviorSubject<AuthSession | null>(this.leer());
  readonly sesion$ = this.subject.asObservable();
  get sesion(): AuthSession | null { return this.subject.value; }
  get token(): string | null { return this.sesion?.token || null; }
  guardar(sesion: AuthSession): void { sessionStorage.setItem(this.clave, JSON.stringify(sesion)); this.subject.next(sesion); }
  limpiar(): void { sessionStorage.removeItem(this.clave); this.subject.next(null); }
  private leer(): AuthSession | null { try { const v=sessionStorage.getItem(this.clave); return v?JSON.parse(v) as AuthSession:null; } catch { return null; } }
}
