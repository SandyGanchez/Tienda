import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ImagenesService {
  resolver(ruta: string | null | undefined): string | null {
    if (!ruta) return null;
    if (/^https?:\/\//i.test(ruta)) return ruta;
    return ruta.startsWith('/') ? `${environment.API_BASE_URL}${ruta}` : ruta;
  }
}
