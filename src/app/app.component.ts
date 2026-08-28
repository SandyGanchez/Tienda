import { Component, inject, OnInit } from '@angular/core';
import { SqliteService } from './services/sqlite.service';
import { AuthService } from './services/auth.service';
import { SyncService } from './services/sync.service';
import { ClienteAuthService } from './services/cliente-auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private readonly sqliteService = inject(SqliteService);
  private readonly authService = inject(AuthService);
  private readonly clienteAuthService = inject(ClienteAuthService);
  private readonly syncService = inject(SyncService);

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.authService.restaurarSesion(),
      this.clienteAuthService.restaurarSesion()
    ]);
    void this.syncService.reintentar();
    try {
      await this.sqliteService.initDB();
    } catch (error: unknown) {
      console.error('No se pudo inicializar SQLite', error);
    }
  }
}
