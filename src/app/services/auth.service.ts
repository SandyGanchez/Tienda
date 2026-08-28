import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthSession, EmpleadoSesion, Rol } from '../models/auth';
import { AuthSessionStore } from './auth-session.service';
import { GoogleIdentityService } from './google-identity.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly store = inject(AuthSessionStore);
  private readonly google = inject(GoogleIdentityService);
  readonly sesion$ = this.store.sesion$;

  get sesion(): AuthSession | null { return this.store.sesion; }
  get token(): string | null { return this.store.token; }
  estaAutenticado(): boolean { return Boolean(this.token); }
  tieneRol(...roles: Rol[]): boolean { return Boolean(this.sesion && roles.includes(this.sesion.empleado.cargo)); }

  login(correo: string, password: string): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${environment.API_BASE_URL}/auth/login`, { correo: correo.trim().toLowerCase(), password });
  }

  async loginGoogle(): Promise<AuthSession> {
    const idToken = await this.google.obtenerIdToken();
    return firstValueFrom(this.http.post<AuthSession>(`${environment.API_BASE_URL}/auth/google`, { idToken }));
  }

  guardarSesion(sesion: AuthSession): void {
    this.store.guardar(sesion);
  }

  me(): Observable<{ empleado: EmpleadoSesion }> {
    return this.http.get<{ empleado: EmpleadoSesion }>(`${environment.API_BASE_URL}/auth/me`);
  }

  async restaurarSesion(): Promise<void> {
    if (!this.token) return;
    try {
      const respuesta = await firstValueFrom(this.me());
      this.guardarSesion({ token: this.token!, empleado: respuesta.empleado });
    } catch { this.limpiarSesion(); }
  }

  async logout(): Promise<void> {
    this.store.limpiar();
    await this.google.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  limpiarSesion(): void {
    this.store.limpiar();
  }

  esCancelacionGoogle(error: unknown): boolean {
    return this.google.esCancelacion(error);
  }

}
