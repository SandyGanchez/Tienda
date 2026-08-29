import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Rol } from '../models/auth';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  canActivate(): boolean | UrlTree {
    return this.auth.estaAutenticado() ? true : this.router.parseUrl('/login');
  }
}

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const roles = route.data['roles'] as Rol[];
    if (!this.auth.estaAutenticado()) return this.router.parseUrl('/login');
    return this.auth.tieneRol(...roles)
      ? true
      : this.router.parseUrl(this.auth.tieneRol('ADMINISTRADOR') ? '/home' : '/cajero');
  }
}
