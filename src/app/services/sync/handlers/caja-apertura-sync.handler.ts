import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CajaService } from '../../caja.service';
import { ItemColaSync } from '../../sqlite/sqlite-sync-queue.repository';
import { SyncOperationHandler } from '../sync-handler.interface';

/**
 * =========================================================================
 * Open/Closed Principle (OCP) - Caja Apertura Sync Handler
 * =========================================================================
 * Estrategia de sincronización para operaciones 'APERTURA'.
 */
@Injectable({
  providedIn: 'root',
})
export class CajaAperturaSyncHandler implements SyncOperationHandler {
  readonly tipo = 'APERTURA';

  private readonly cajas = inject(CajaService);

  async ejecutar(op: ItemColaSync, payload: any): Promise<void> {
    await firstValueFrom(this.cajas.abrir(payload.uuidSesionCaja, payload.fondoInicial));
  }
}
