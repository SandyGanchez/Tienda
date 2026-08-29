import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { Productos } from '../models/productos';
import { ProductoPos } from '../models/venta';

@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db?: SQLiteDBConnection;
  private initPromise?: Promise<void>;

  constructor() {}

  readonly disponible = Capacitor.isNativePlatform();

  initDB(): Promise<void> {
    if (!this.disponible) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.inicializarDB().catch((error: unknown) => {
        this.initPromise = undefined;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`No se pudo inicializar SQLite: ${message}`);
      });
    }

    return this.initPromise;
  }

  private async inicializarDB(): Promise<void> {
    this.db = await this.sqlite.createConnection('tiendaDB', false, 'no-encryption', 1, false);

    await this.db.open();

    await this.crearTablas();
  }

  private async crearTablas(): Promise<void> {
    const db = this.obtenerDBInicializada();

    const queryProductos = `
      CREATE TABLE IF NOT EXISTS productos (
        idPro INTEGER PRIMARY KEY,
        nombrePro TEXT,
        precioVentaPro REAL,
        costoPro REAL,
        existenciaPro INTEGER,
        stockMinimoPro INTEGER,
        tamanoPro TEXT,
        presentacionPro TEXT,
        tipoPro TEXT,
        codigoQR TEXT UNIQUE,
        skuPro TEXT,
        imagenPro TEXT,
        idMarca INTEGER,
        idCat INTEGER,
        pendienteSync INTEGER DEFAULT 0
      );
    `;

    await db.execute(queryProductos);
    await this.migrarProductos(db);

    const queryVentas = `
      CREATE TABLE IF NOT EXISTS ventas (
        idVenta INTEGER PRIMARY KEY AUTOINCREMENT,
        fechaVenta TEXT,
        horaVenta TEXT,
        total REAL,
        idEmp INTEGER,
        idSuc INTEGER,
        pendienteSync INTEGER DEFAULT 0
      );
    `;

    await db.execute(queryVentas);
    await db.execute(
      `CREATE TABLE IF NOT EXISTS sesiones_caja_local(uuidSesionCaja TEXT PRIMARY KEY,idSesionCaja INTEGER,idEmp INTEGER NOT NULL,idSuc INTEGER NOT NULL,fechaHoraApertura TEXT NOT NULL,fondoInicial REAL NOT NULL,fechaHoraCierre TEXT,efectivoContado REAL,observaciones TEXT,estado TEXT NOT NULL,estadoSync TEXT NOT NULL DEFAULT 'PENDIENTE',errorSync TEXT)`,
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS ventas_local(uuidVenta TEXT PRIMARY KEY,idVenta INTEGER,idSesionCaja INTEGER,uuidSesionCaja TEXT NOT NULL,idEmp INTEGER NOT NULL,idSuc INTEGER NOT NULL,fechaHora TEXT NOT NULL,totalLocal REAL NOT NULL,metodoPago TEXT NOT NULL,montoRecibido REAL,estadoSync TEXT NOT NULL DEFAULT 'PENDIENTE',errorSync TEXT)`,
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS detalles_venta_local(id INTEGER PRIMARY KEY AUTOINCREMENT,uuidVenta TEXT NOT NULL,idPro INTEGER NOT NULL,nombre TEXT NOT NULL,cantidad INTEGER NOT NULL,precioLocal REAL NOT NULL,subtotalLocal REAL NOT NULL)`,
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS movimientos_caja_local(uuidMovimientoCaja TEXT PRIMARY KEY,idMovimientoCaja INTEGER,uuidSesionCaja TEXT NOT NULL,idEmp INTEGER NOT NULL,tipoMovimiento TEXT NOT NULL,monto REAL NOT NULL,concepto TEXT NOT NULL,fechaHora TEXT NOT NULL,estadoSync TEXT NOT NULL DEFAULT 'PENDIENTE',errorSync TEXT)`,
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS cola_sync(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,uuid TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,orden INTEGER NOT NULL,estado TEXT NOT NULL DEFAULT 'PENDIENTE',error TEXT,creadoEn TEXT NOT NULL)`,
    );
  }

  private async migrarProductos(db: SQLiteDBConnection): Promise<void> {
    const info = await db.query('PRAGMA table_info(productos)');
    const columnas = new Set(
      (info.values || [])
        .map((columna: { name?: string }) => columna.name)
        .filter((nombre): nombre is string => Boolean(nombre)),
    );
    const migraciones: Array<{ nombre: string; sql: string }> = [
      { nombre: 'costoPro', sql: 'ALTER TABLE productos ADD COLUMN costoPro REAL' },
      { nombre: 'stockMinimoPro', sql: 'ALTER TABLE productos ADD COLUMN stockMinimoPro INTEGER' },
      { nombre: 'skuPro', sql: 'ALTER TABLE productos ADD COLUMN skuPro TEXT' },
      { nombre: 'imagenPro', sql: 'ALTER TABLE productos ADD COLUMN imagenPro TEXT' },
    ];
    for (const migracion of migraciones) {
      if (!columnas.has(migracion.nombre)) {
        await db.execute(migracion.sql);
      }
    }
  }

  private async getDB(): Promise<SQLiteDBConnection> {
    await this.initDB();
    return this.obtenerDBInicializada();
  }

  private obtenerDBInicializada(): SQLiteDBConnection {
    if (!this.db) {
      throw new Error('SQLite no está inicializada');
    }

    return this.db;
  }

  // =========================
  // GUARDAR PRODUCTO
  // =========================
  async guardarProducto(producto: Productos, offline = false) {
    if (!this.disponible) return;
    const db = await this.getDB();

    const query = `
      INSERT INTO productos (
        idPro,
        nombrePro,
        precioVentaPro,
        costoPro,
        existenciaPro,
        stockMinimoPro,
        tamanoPro,
        presentacionPro,
        tipoPro,
        codigoQR,
        skuPro,
        imagenPro,
        idMarca,
        idCat,
        pendienteSync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigoQR) DO UPDATE SET
        idPro = excluded.idPro,
        nombrePro = excluded.nombrePro,
        precioVentaPro = excluded.precioVentaPro,
        costoPro = excluded.costoPro,
        existenciaPro = excluded.existenciaPro,
        stockMinimoPro = excluded.stockMinimoPro,
        tamanoPro = excluded.tamanoPro,
        presentacionPro = excluded.presentacionPro,
        tipoPro = excluded.tipoPro,
        skuPro = excluded.skuPro,
        imagenPro = excluded.imagenPro,
        idMarca = excluded.idMarca,
        idCat = excluded.idCat,
        pendienteSync = excluded.pendienteSync
      ON CONFLICT(idPro) DO UPDATE SET
        nombrePro = excluded.nombrePro,
        precioVentaPro = excluded.precioVentaPro,
        costoPro = excluded.costoPro,
        existenciaPro = excluded.existenciaPro,
        stockMinimoPro = excluded.stockMinimoPro,
        tamanoPro = excluded.tamanoPro,
        presentacionPro = excluded.presentacionPro,
        tipoPro = excluded.tipoPro,
        codigoQR = excluded.codigoQR,
        skuPro = excluded.skuPro,
        imagenPro = excluded.imagenPro,
        idMarca = excluded.idMarca,
        idCat = excluded.idCat,
        pendienteSync = excluded.pendienteSync
    `;

    await db.run(query, [
      producto.idPro,
      producto.nombrePro,
      producto.precioVentaPro,
      producto.costoPro,
      producto.existenciaPro,
      producto.stockMinimoPro,
      producto.tamanoPro,
      producto.presentacionPro,
      producto.tipoPro,
      producto.codigoQR,
      producto.skuPro,
      producto.imagenPro,
      producto.idMarca,
      producto.idCat,
      offline ? 1 : 0,
    ]);
  }

  // =========================
  // BUSCAR POR QR LOCAL
  // =========================
  async buscarPorQR(codigoQR: string): Promise<Productos | null> {
    if (!this.disponible) return null;
    const db = await this.getDB();

    const query = `
      SELECT * FROM productos
      WHERE codigoQR = ?
    `;

    const result = await db.query(query, [codigoQR]);

    if (result.values && result.values.length > 0) {
      return result.values[0] as Productos;
    }

    return null;
  }

  // =========================
  // OBTENER PRODUCTOS
  // =========================
  async getProductosLocales(): Promise<Productos[]> {
    if (!this.disponible) return [];
    const db = await this.getDB();

    const result = await db.query(`SELECT * FROM productos`);

    return (result.values as Productos[]) || [];
  }

  // =========================
  // PRODUCTOS PENDIENTES
  // =========================
  async getPendientesSync(): Promise<Productos[]> {
    if (!this.disponible) return [];
    const db = await this.getDB();

    const result = await db.query(`
      SELECT * FROM productos
      WHERE pendienteSync = 1
    `);

    return (result.values as Productos[]) || [];
  }

  // =========================
  // MARCAR SINCRONIZADO
  // =========================
  async marcarSincronizado(idPro: number) {
    if (!this.disponible) return;
    const db = await this.getDB();

    await db.run(
      `
      UPDATE productos
      SET pendienteSync = 0
      WHERE idPro = ?
    `,
      [idPro],
    );
  }
  async guardarProductoPos(producto: ProductoPos): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `INSERT INTO productos(idPro,nombrePro,precioVentaPro,existenciaPro,tamanoPro,presentacionPro,codigoQR,skuPro,imagenPro,pendienteSync) VALUES(?,?,?,?,?,?,?,?,?,0) ON CONFLICT(idPro) DO UPDATE SET nombrePro=excluded.nombrePro,precioVentaPro=excluded.precioVentaPro,existenciaPro=excluded.existenciaPro,tamanoPro=excluded.tamanoPro,presentacionPro=excluded.presentacionPro,codigoQR=excluded.codigoQR,skuPro=excluded.skuPro,imagenPro=excluded.imagenPro`,
      [
        producto.idPro,
        producto.nombrePro,
        producto.precioVentaPro,
        producto.existenciaPro,
        producto.tamanoPro,
        producto.presentacionPro,
        producto.codigoQR,
        producto.skuPro,
        producto.imagenPro,
      ],
    );
  }

  async eliminarProductoLocal(idPro: number): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run('DELETE FROM productos WHERE idPro = ?', [idPro]);
  }

  async encolar(tipo: string, uuid: string, payload: unknown, orden: number): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `INSERT INTO cola_sync(tipo,uuid,payload,orden,estado,creadoEn) VALUES(?,?,?,?, 'PENDIENTE',datetime('now')) ON CONFLICT(uuid) DO NOTHING`,
      [tipo, uuid, JSON.stringify(payload), orden],
    );
  }
  async pendientesSync(): Promise<
    Array<{
      id: number;
      tipo: string;
      uuid: string;
      payload: string;
      orden: number;
      estado: string;
      error: string | null;
    }>
  > {
    if (!this.disponible) return [];
    const db = await this.getDB();
    const r = await db.query(`SELECT * FROM cola_sync WHERE estado IN ('PENDIENTE','CONFLICTO') ORDER BY orden,id`);
    return r.values || [];
  }
  async actualizarCola(
    uuid: string,
    estado: 'SINCRONIZADA' | 'CONFLICTO' | 'PENDIENTE',
    error: string | null = null,
  ): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run('UPDATE cola_sync SET estado=?,error=? WHERE uuid=?', [estado, error, uuid]);
  }
  async marcarEntidadSync(
    tipo: string,
    uuid: string,
    estado: 'SINCRONIZADA' | 'CONFLICTO' | 'PENDIENTE',
    error: string | null = null,
  ): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    if (tipo === 'VENTA')
      await db.run('UPDATE ventas_local SET estadoSync=?,errorSync=? WHERE uuidVenta=?', [estado, error, uuid]);
    else if (tipo === 'MOVIMIENTO')
      await db.run('UPDATE movimientos_caja_local SET estadoSync=?,errorSync=? WHERE uuidMovimientoCaja=?', [
        estado,
        error,
        uuid,
      ]);
    else if (tipo === 'APERTURA')
      await db.run('UPDATE sesiones_caja_local SET estadoSync=?,errorSync=? WHERE uuidSesionCaja=?', [
        estado,
        error,
        uuid,
      ]);
  }
  async guardarCajaLocal(
    caja: {
      uuidSesionCaja: string;
      idSesionCaja?: number;
      idEmp: number;
      idSuc: number;
      fechaHoraApertura: string;
      fondoInicial: number;
      estado: string;
    },
    estadoSync: string,
  ): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `INSERT INTO sesiones_caja_local(uuidSesionCaja,idSesionCaja,idEmp,idSuc,fechaHoraApertura,fondoInicial,estado,estadoSync) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(uuidSesionCaja) DO UPDATE SET idSesionCaja=excluded.idSesionCaja,estado=excluded.estado,estadoSync=excluded.estadoSync`,
      [
        caja.uuidSesionCaja,
        caja.idSesionCaja || null,
        caja.idEmp,
        caja.idSuc,
        caja.fechaHoraApertura,
        caja.fondoInicial,
        caja.estado,
        estadoSync,
      ],
    );
  }
  async cajaLocalAbierta(idEmp: number): Promise<Record<string, unknown> | null> {
    if (!this.disponible) return null;
    const db = await this.getDB();
    const r = await db.query(
      `SELECT * FROM sesiones_caja_local WHERE idEmp=? AND estado='ABIERTA' ORDER BY fechaHoraApertura DESC LIMIT 1`,
      [idEmp],
    );
    return r.values?.[0] || null;
  }
  async guardarVentaOffline(venta: {
    uuidVenta: string;
    uuidSesionCaja: string;
    idEmp: number;
    idSuc: number;
    total: number;
    metodoPago: string;
    montoRecibido: number | null;
    items: Array<{ idPro: number; nombre: string; cantidad: number; precioUnitario: number; subtotal: number }>;
  }): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.execute('BEGIN TRANSACTION');
    try {
      await db.run(
        `INSERT INTO ventas_local(uuidVenta,uuidSesionCaja,idEmp,idSuc,fechaHora,totalLocal,metodoPago,montoRecibido,estadoSync) VALUES(?,?,?,?,datetime('now'),?,?,?,'PENDIENTE')`,
        [
          venta.uuidVenta,
          venta.uuidSesionCaja,
          venta.idEmp,
          venta.idSuc,
          venta.total,
          venta.metodoPago,
          venta.montoRecibido,
        ],
      );
      for (const i of venta.items) {
        await db.run(
          `INSERT INTO detalles_venta_local(uuidVenta,idPro,nombre,cantidad,precioLocal,subtotalLocal) VALUES(?,?,?,?,?,?)`,
          [venta.uuidVenta, i.idPro, i.nombre, i.cantidad, i.precioUnitario, i.subtotal],
        );
        await db.run('UPDATE productos SET existenciaPro=existenciaPro-? WHERE idPro=? AND existenciaPro>=?', [
          i.cantidad,
          i.idPro,
          i.cantidad,
        ]);
      }
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  }
  async guardarMovimientoOffline(m: {
    uuidMovimientoCaja: string;
    uuidSesionCaja: string;
    idEmp: number;
    tipoMovimiento: string;
    monto: number;
    concepto: string;
  }): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `INSERT INTO movimientos_caja_local(uuidMovimientoCaja,uuidSesionCaja,idEmp,tipoMovimiento,monto,concepto,fechaHora,estadoSync) VALUES(?,?,?,?,?,?,datetime('now'),'PENDIENTE') ON CONFLICT(uuidMovimientoCaja) DO NOTHING`,
      [m.uuidMovimientoCaja, m.uuidSesionCaja, m.idEmp, m.tipoMovimiento, m.monto, m.concepto],
    );
  }
  async cerrarCajaOffline(uuidSesionCaja: string, efectivoContado: number, observaciones: string): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `UPDATE sesiones_caja_local SET fechaHoraCierre=datetime('now'),efectivoContado=?,observaciones=?,estado='CIERRE_PENDIENTE',estadoSync='PENDIENTE' WHERE uuidSesionCaja=?`,
      [efectivoContado, observaciones, uuidSesionCaja],
    );
  }
  async marcarCajaCerrada(
    uuidSesionCaja: string,
    estadoSync: 'SINCRONIZADA' | 'PENDIENTE',
    cierre?: { fechaHoraCierre?: string | null; efectivoContado?: number | null; observaciones?: string | null },
  ): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(
      `UPDATE sesiones_caja_local SET fechaHoraCierre=COALESCE(?,fechaHoraCierre),efectivoContado=COALESCE(?,efectivoContado),observaciones=COALESCE(?,observaciones),estado='CERRADA',estadoSync=?,errorSync=NULL WHERE uuidSesionCaja=?`,
      [
        cierre?.fechaHoraCierre || null,
        cierre?.efectivoContado ?? null,
        cierre?.observaciones || null,
        estadoSync,
        uuidSesionCaja,
      ],
    );
  }
  async resumenCajaLocal(
    uuidSesionCaja: string,
  ): Promise<{
    totalVentas: number;
    totalEfectivo: number;
    totalTarjeta: number;
    totalTransferencia: number;
    totalIngresos: number;
    totalRetiros: number;
    numeroVentas: number;
  }> {
    if (!this.disponible)
      return {
        totalVentas: 0,
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalTransferencia: 0,
        totalIngresos: 0,
        totalRetiros: 0,
        numeroVentas: 0,
      };
    const db = await this.getDB();
    const v = await db.query(
      `SELECT COALESCE(SUM(totalLocal),0) totalVentas,COALESCE(SUM(CASE WHEN metodoPago='EFECTIVO' THEN totalLocal ELSE 0 END),0) totalEfectivo,COALESCE(SUM(CASE WHEN metodoPago='TARJETA' THEN totalLocal ELSE 0 END),0) totalTarjeta,COALESCE(SUM(CASE WHEN metodoPago='TRANSFERENCIA' THEN totalLocal ELSE 0 END),0) totalTransferencia,COUNT(*) numeroVentas FROM ventas_local WHERE uuidSesionCaja=?`,
      [uuidSesionCaja],
    );
    const m = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipoMovimiento='INGRESO' THEN monto ELSE 0 END),0) totalIngresos,COALESCE(SUM(CASE WHEN tipoMovimiento='RETIRO' THEN monto ELSE 0 END),0) totalRetiros FROM movimientos_caja_local WHERE uuidSesionCaja=?`,
      [uuidSesionCaja],
    );
    return { ...v.values![0], ...m.values![0] };
  }
}
