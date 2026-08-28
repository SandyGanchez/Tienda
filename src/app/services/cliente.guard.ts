import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ClienteAuthService } from './cliente-auth.service';

@Injectable({ providedIn: 'root' })
export class ClienteGuard implements CanActivate {
  private readonly auth = inject(ClienteAuthService);
  private readonly router = inject(Router);
  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    return this.auth.estaAutenticado()
      ? true
      : this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
}
