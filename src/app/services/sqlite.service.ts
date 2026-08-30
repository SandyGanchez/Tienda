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
      `CREATE TABLE IF NOT EXISTS usuarios_offline (
        idEmp INTEGER PRIMARY KEY,
        correo TEXT UNIQUE NOT NULL,
        contrasenaHash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        apellidoPat TEXT,
        apellidoMat TEXT,
        cargo TEXT NOT NULL,
        idSuc INTEGER NOT NULL,
        nombreSuc TEXT NOT NULL,
        activo INTEGER DEFAULT 1
      );`,
    );
    await this.sembrarAdminOffline(db);
    await db.execute(
      `CREATE TABLE IF NOT EXISTS marcas (
        idMarca INTEGER PRIMARY KEY,
        nombreMarca TEXT NOT NULL,
        descripMarca TEXT,
        pendienteSync INTEGER DEFAULT 0
      );`,
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS categorias (
        idCat INTEGER PRIMARY KEY,
        nombreCat TEXT NOT NULL,
        descripCat TEXT,
        pendienteSync INTEGER DEFAULT 0
      );`,
    );
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

  private async sembrarAdminOffline(db: SQLiteDBConnection): Promise<void> {
    const hashAdmin = await this.hashTexto('admin1234');
    await db.run(
      `INSERT INTO usuarios_offline (
        idEmp, correo, contrasenaHash, nombre, apellidoPat, apellidoMat, cargo, idSuc, nombreSuc, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(correo) DO NOTHING`,
      [
        1,
        'admin@tienda.com',
        hashAdmin,
        'Administrador Offline',
        'Sistema',
        null,
        'ADMINISTRADOR',
        1,
        'Sucursal Central',
      ],
    );
  }

  async hashTexto(texto: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(texto.trim());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return texto.trim();
    }
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
  async sincronizarCatalogo(productos: any[]): Promise<void> {
    if (!this.disponible || !Array.isArray(productos)) return;
    const db = await this.getDB();

    const idsValidos: number[] = [];

    for (const item of productos) {
      const idPro = Number(item.idPro);
      if (!Number.isInteger(idPro) || idPro <= 0) continue;
      idsValidos.push(idPro);

      const qr = item.codigoQR ? String(item.codigoQR).trim() : null;

      if (qr) {
        await db.run('DELETE FROM productos WHERE codigoQR = ? AND idPro != ?', [qr, idPro]);
      }

      await db.run(
        `INSERT INTO productos (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(idPro) DO UPDATE SET
          nombrePro = excluded.nombrePro,
          precioVentaPro = excluded.precioVentaPro,
          costoPro = CASE WHEN excluded.costoPro IS NOT NULL THEN excluded.costoPro ELSE productos.costoPro END,
          existenciaPro = excluded.existenciaPro,
          stockMinimoPro = CASE WHEN excluded.stockMinimoPro IS NOT NULL THEN excluded.stockMinimoPro ELSE productos.stockMinimoPro END,
          tamanoPro = excluded.tamanoPro,
          presentacionPro = excluded.presentacionPro,
          tipoPro = CASE WHEN excluded.tipoPro IS NOT NULL THEN excluded.tipoPro ELSE productos.tipoPro END,
          codigoQR = excluded.codigoQR,
          skuPro = excluded.skuPro,
          imagenPro = excluded.imagenPro,
          idMarca = CASE WHEN excluded.idMarca IS NOT NULL THEN excluded.idMarca ELSE productos.idMarca END,
          idCat = CASE WHEN excluded.idCat IS NOT NULL THEN excluded.idCat ELSE productos.idCat END,
          pendienteSync = 0`,
        [
          idPro,
          item.nombrePro || '',
          item.precioVentaPro !== undefined && item.precioVentaPro !== null ? Number(item.precioVentaPro) : 0,
          item.costoPro !== undefined && item.costoPro !== null ? Number(item.costoPro) : null,
          Number(item.existenciaPro) || 0,
          item.stockMinimoPro !== undefined && item.stockMinimoPro !== null ? Number(item.stockMinimoPro) : null,
          item.tamanoPro || null,
          item.presentacionPro || null,
          item.tipoPro || null,
          qr,
          item.skuPro || null,
          item.imagenPro || null,
          item.idMarca ? Number(item.idMarca) : null,
          item.idCat ? Number(item.idCat) : null,
        ],
      );
    }

    if (idsValidos.length > 0) {
      const placeholders = idsValidos.map(() => '?').join(',');
      await db.run(`DELETE FROM productos WHERE idPro NOT IN (${placeholders}) AND pendienteSync = 0`, idsValidos);
    } else {
      await db.run(`DELETE FROM productos WHERE pendienteSync = 0`);
    }
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
    await db.run('DELETE FROM productos WHERE idPro = ?', [Number(idPro)]);
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
  async resumenCajaLocal(uuidSesionCaja: string): Promise<{
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

  // =========================
  // USUARIOS OFFLINE
  // =========================
  async guardarUsuarioOffline(empleado: any, password?: string): Promise<void> {
    if (!this.disponible || !empleado) return;
    const db = await this.getDB();
    const hash = password ? await this.hashTexto(password) : await this.hashTexto('admin1234');
    const correo = String(empleado.correo || empleado.correoEmp || '').trim().toLowerCase();
    if (!correo) return;

    await db.run(
      `INSERT INTO usuarios_offline (
        idEmp, correo, contrasenaHash, nombre, apellidoPat, apellidoMat, cargo, idSuc, nombreSuc, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(correo) DO UPDATE SET
        contrasenaHash = excluded.contrasenaHash,
        nombre = excluded.nombre,
        apellidoPat = excluded.apellidoPat,
        apellidoMat = excluded.apellidoMat,
        cargo = excluded.cargo,
        idSuc = excluded.idSuc,
        nombreSuc = excluded.nombreSuc,
        activo = 1`,
      [
        Number(empleado.idEmp) || 1,
        correo,
        hash,
        empleado.nombreEmp || empleado.nombre || 'Usuario',
        empleado.apellidoPatEmp || null,
        empleado.apellidoMatEmp || null,
        empleado.cargo || 'ADMINISTRADOR',
        Number(empleado.idSuc) || 1,
        empleado.nombreSuc || 'Sucursal Central',
      ],
    );
  }

  async verificarUsuarioOffline(correo: string, password: string): Promise<any | null> {
    if (!this.disponible) return null;
    const db = await this.getDB();
    const c = correo.trim().toLowerCase();
    const res = await db.query(`SELECT * FROM usuarios_offline WHERE correo = ? AND activo = 1`, [c]);
    if (!res.values || res.values.length === 0) return null;

    const user = res.values[0];
    const hashIngresado = await this.hashTexto(password);

    if (user.contrasenaHash === hashIngresado || user.contrasenaHash === password.trim()) {
      return {
        idEmp: user.idEmp,
        nombre: [user.nombre, user.apellidoPat, user.apellidoMat].filter(Boolean).join(' '),
        nombreEmp: user.nombre,
        apellidoPatEmp: user.apellidoPat,
        apellidoMatEmp: user.apellidoMat,
        correo: user.correo,
        cargo: user.cargo,
        idSuc: user.idSuc,
        nombreSuc: user.nombreSuc,
        estadoEmp: true,
      };
    }
    return null;
  }

  // =========================
  // CREACIÓN Y RECONCILIACIÓN OFFLINE DE PRODUCTOS
  // =========================
  async guardarProductoOffline(
    producto: any,
    fotoBase64?: string | null,
    fotoNombre?: string | null,
    fotoMime?: string | null,
  ): Promise<{ idProTemporal: number; uuid: string }> {
    if (!this.disponible) throw new Error('SQLite no disponible');
    const db = await this.getDB();

    const idTemp = producto.idPro && producto.idPro < 0 ? producto.idPro : -Math.floor(Date.now() / 1000);
    const uuid = `PROD-${Math.abs(idTemp)}-${Date.now()}`;

    await db.run(
      `INSERT INTO productos (
        idPro, nombrePro, precioVentaPro, costoPro, existenciaPro, stockMinimoPro,
        tamanoPro, presentacionPro, tipoPro, codigoQR, skuPro, imagenPro, idMarca, idCat, pendienteSync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
        pendienteSync = 1`,
      [
        idTemp,
        producto.nombre || producto.nombrePro || '',
        Number(producto.precio ?? producto.precioVentaPro ?? 0),
        producto.costo !== null && producto.costo !== undefined ? Number(producto.costo ?? producto.costoPro) : null,
        Number(producto.existencia ?? producto.existenciaPro ?? 0),
        producto.stockMinimo !== null && producto.stockMinimo !== undefined ? Number(producto.stockMinimo ?? producto.stockMinimoPro) : null,
        producto.tamano || producto.tamanoPro || null,
        producto.presentacion || producto.presentacionPro || null,
        producto.tipo || producto.tipoPro || null,
        producto.codigoQR ? String(producto.codigoQR).trim() : null,
        producto.sku || producto.skuPro || null,
        fotoBase64 || producto.imagen || producto.imagenPro || null,
        producto.idMarca ? Number(producto.idMarca) : null,
        producto.idCat ? Number(producto.idCat) : null,
      ],
    );

    await this.encolar('PRODUCTO_CREAR', uuid, {
      tempId: idTemp,
      dto: {
        nombre: producto.nombre || producto.nombrePro,
        precio: Number(producto.precio ?? producto.precioVentaPro ?? 0),
        costo: producto.costo !== null && producto.costo !== undefined ? Number(producto.costo ?? producto.costoPro) : null,
        existencia: Number(producto.existencia ?? producto.existenciaPro ?? 0),
        stockMinimo: producto.stockMinimo !== null && producto.stockMinimo !== undefined ? Number(producto.stockMinimo ?? producto.stockMinimoPro) : null,
        tamano: producto.tamano || producto.tamanoPro || null,
        presentacion: producto.presentacion || producto.presentacionPro || null,
        tipo: producto.tipo || producto.tipoPro || null,
        codigoQR: producto.codigoQR ? String(producto.codigoQR).trim() : null,
        sku: producto.sku || producto.skuPro || null,
        idMarca: producto.idMarca ? Number(producto.idMarca) : null,
        idCat: producto.idCat ? Number(producto.idCat) : null,
      },
      fotoBase64: fotoBase64 || null,
      fotoNombre: fotoNombre || 'producto.jpg',
      fotoMime: fotoMime || 'image/jpeg',
    }, 5);

    return { idProTemporal: idTemp, uuid };
  }

  async reconciliarProductoOffline(idTemporal: number, productoReal: any): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(`DELETE FROM productos WHERE idPro = ?`, [idTemporal]);
    await db.run(
      `INSERT INTO productos (
        idPro, nombrePro, precioVentaPro, costoPro, existenciaPro, stockMinimoPro,
        tamanoPro, presentacionPro, tipoPro, codigoQR, skuPro, imagenPro, idMarca, idCat, pendienteSync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
        pendienteSync = 0`,
      [
        Number(productoReal.idPro),
        productoReal.nombrePro,
        Number(productoReal.precioVentaPro || 0),
        productoReal.costoPro !== null && productoReal.costoPro !== undefined ? Number(productoReal.costoPro) : null,
        Number(productoReal.existenciaPro || 0),
        productoReal.stockMinimoPro !== null && productoReal.stockMinimoPro !== undefined ? Number(productoReal.stockMinimoPro) : null,
        productoReal.tamanoPro || null,
        productoReal.presentacionPro || null,
        productoReal.tipoPro || null,
        productoReal.codigoQR || null,
        productoReal.skuPro || null,
        productoReal.imagenPro || null,
        productoReal.idMarca ? Number(productoReal.idMarca) : null,
        productoReal.idCat ? Number(productoReal.idCat) : null,
      ],
    );
  }

  async reemplazarPorProductoOnline(codigoQR: string, productoOnline: any): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    if (codigoQR) {
      await db.run(`DELETE FROM productos WHERE codigoQR = ? AND (idPro < 0 OR pendienteSync = 1)`, [codigoQR]);
    }
    await this.reconciliarProductoOffline(productoOnline.idPro, productoOnline);
  }

  // =========================
  // MARCAS
  // =========================
  async sincronizarMarcas(marcas: any[]): Promise<void> {
    if (!this.disponible || !Array.isArray(marcas)) return;
    const db = await this.getDB();
    const idsValidos: number[] = [];

    for (const m of marcas) {
      const idMarca = Number(m.idMarca);
      if (!Number.isInteger(idMarca) || idMarca <= 0) continue;
      idsValidos.push(idMarca);

      await db.run(
        `INSERT INTO marcas (idMarca, nombreMarca, descripMarca, pendienteSync)
         VALUES (?, ?, ?, 0)
         ON CONFLICT(idMarca) DO UPDATE SET
           nombreMarca = excluded.nombreMarca,
           descripMarca = excluded.descripMarca,
           pendienteSync = 0`,
        [idMarca, m.nombreMarca || '', m.descripMarca || null],
      );
    }

    if (idsValidos.length > 0) {
      const placeholders = idsValidos.map(() => '?').join(',');
      await db.run(`DELETE FROM marcas WHERE idMarca NOT IN (${placeholders}) AND pendienteSync = 0`, idsValidos);
    }
  }

  async getMarcasLocales(): Promise<any[]> {
    if (!this.disponible) return [];
    const db = await this.getDB();
    const r = await db.query(`SELECT * FROM marcas ORDER BY nombreMarca ASC`);
    return r.values || [];
  }

  async guardarMarcaOffline(dto: { nombre: string; descripcion?: string }): Promise<any> {
    if (!this.disponible) throw new Error('SQLite no disponible');
    const db = await this.getDB();
    const idTemp = -Math.floor(Date.now() / 1000);
    const uuid = `MARCA-${Math.abs(idTemp)}-${Date.now()}`;

    await db.run(
      `INSERT INTO marcas (idMarca, nombreMarca, descripMarca, pendienteSync)
       VALUES (?, ?, ?, 1)`,
      [idTemp, dto.nombre.trim(), dto.descripcion?.trim() || null],
    );

    await this.encolar('MARCA_CREAR', uuid, {
      tempId: idTemp,
      nombre: dto.nombre.trim(),
      descripcion: dto.descripcion?.trim() || '',
    }, 2);

    return {
      idMarca: idTemp,
      nombreMarca: dto.nombre.trim(),
      descripMarca: dto.descripcion?.trim() || null,
      pendienteSync: 1,
    };
  }

  async reconciliarMarcaOffline(idTemporal: number, marcaReal: any): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(`DELETE FROM marcas WHERE idMarca = ?`, [idTemporal]);
    await db.run(
      `INSERT INTO marcas (idMarca, nombreMarca, descripMarca, pendienteSync)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(idMarca) DO UPDATE SET
         nombreMarca = excluded.nombreMarca,
         descripMarca = excluded.descripMarca,
         pendienteSync = 0`,
      [Number(marcaReal.idMarca), marcaReal.nombreMarca, marcaReal.descripMarca || null],
    );
    await db.run(`UPDATE productos SET idMarca = ? WHERE idMarca = ?`, [Number(marcaReal.idMarca), idTemporal]);
  }

  // =========================
  // CATEGORIAS
  // =========================
  async sincronizarCategorias(categorias: any[]): Promise<void> {
    if (!this.disponible || !Array.isArray(categorias)) return;
    const db = await this.getDB();
    const idsValidos: number[] = [];

    for (const c of categorias) {
      const idCat = Number(c.idCat);
      if (!Number.isInteger(idCat) || idCat <= 0) continue;
      idsValidos.push(idCat);

      await db.run(
        `INSERT INTO categorias (idCat, nombreCat, descripCat, pendienteSync)
         VALUES (?, ?, ?, 0)
         ON CONFLICT(idCat) DO UPDATE SET
           nombreCat = excluded.nombreCat,
           descripCat = excluded.descripCat,
           pendienteSync = 0`,
        [idCat, c.nombreCat || '', c.descripCat || null],
      );
    }

    if (idsValidos.length > 0) {
      const placeholders = idsValidos.map(() => '?').join(',');
      await db.run(`DELETE FROM categorias WHERE idCat NOT IN (${placeholders}) AND pendienteSync = 0`, idsValidos);
    }
  }

  async getCategoriasLocales(): Promise<any[]> {
    if (!this.disponible) return [];
    const db = await this.getDB();
    const r = await db.query(`SELECT * FROM categorias ORDER BY nombreCat ASC`);
    return r.values || [];
  }

  async guardarCategoriaOffline(dto: { nombre: string; descripcion?: string }): Promise<any> {
    if (!this.disponible) throw new Error('SQLite no disponible');
    const db = await this.getDB();
    const idTemp = -Math.floor(Date.now() / 1000);
    const uuid = `CAT-${Math.abs(idTemp)}-${Date.now()}`;

    await db.run(
      `INSERT INTO categorias (idCat, nombreCat, descripCat, pendienteSync)
       VALUES (?, ?, ?, 1)`,
      [idTemp, dto.nombre.trim(), dto.descripcion?.trim() || null],
    );

    await this.encolar('CATEGORIA_CREAR', uuid, {
      tempId: idTemp,
      nombre: dto.nombre.trim(),
      descripcion: dto.descripcion?.trim() || '',
    }, 2);

    return {
      idCat: idTemp,
      nombreCat: dto.nombre.trim(),
      descripCat: dto.descripcion?.trim() || null,
      pendienteSync: 1,
    };
  }

  async reconciliarCategoriaOffline(idTemporal: number, categoriaReal: any): Promise<void> {
    if (!this.disponible) return;
    const db = await this.getDB();
    await db.run(`DELETE FROM categorias WHERE idCat = ?`, [idTemporal]);
    await db.run(
      `INSERT INTO categorias (idCat, nombreCat, descripCat, pendienteSync)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(idCat) DO UPDATE SET
         nombreCat = excluded.nombreCat,
         descripCat = excluded.descripCat,
         pendienteSync = 0`,
      [Number(categoriaReal.idCat), categoriaReal.nombreCat, categoriaReal.descripCat || null],
    );
    await db.run(`UPDATE productos SET idCat = ? WHERE idCat = ?`, [Number(categoriaReal.idCat), idTemporal]);
  }
}
