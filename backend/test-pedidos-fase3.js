const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const puerto = 3200 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${puerto}`;
const resultados = [];
const pedidosPrueba = new Set();
const ventasPrueba = new Set();
const sesionesPrueba = new Set();
const archivosPrueba = new Set();
let servidor;
let db;
let idClienteTemporal;
let idConfiguracionTemporal;
let idSucursalTemporal;
let producto;
let stockOriginal;
let precioOriginal;

function token(sub, tipo) {
  return jwt.sign({ sub: String(sub), tipo }, process.env.JWT_SECRET,
    { expiresIn: '15m', issuer: 'tienda-api' });
}

async function peticion(ruta, opciones = {}, bearer = null) {
  const headers = { ...(opciones.headers || {}) };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (opciones.body && !(opciones.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const respuesta = await fetch(`${baseUrl}${ruta}`, { ...opciones, headers });
  const tipo = respuesta.headers.get('content-type') || '';
  const cuerpo = tipo.includes('json') ? await respuesta.json() : await respuesta.arrayBuffer();
  return { status: respuesta.status, body: cuerpo, headers: respuesta.headers };
}

function comprobar(nombre, condicion, detalle = '') {
  if (!condicion) throw new Error(`${nombre}: ${detalle || 'resultado inesperado'}`);
  resultados.push({ prueba: nombre, resultado: 'OK' });
}

async function esperarServidor() {
  for (let intento = 0; intento < 60; intento += 1) {
    try { await fetch(`${baseUrl}/public/tienda`); return; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  throw new Error('El backend de prueba no inició a tiempo.');
}

async function stock() {
  const [rows] = await db.query('SELECT existenciaPro FROM productos WHERE idPro=?', [producto.idPro]);
  return Number(rows[0].existenciaPro);
}

async function crearPedido(clienteToken, cantidad = 2) {
  const respuesta = await peticion('/cliente/pedidos', {
    method: 'POST', body: JSON.stringify({
      uuidPedido: crypto.randomUUID(), items: [{ idPro: producto.idPro, cantidad }]
    })
  }, clienteToken);
  if (respuesta.body?.idPedido) pedidosPrueba.add(Number(respuesta.body.idPedido));
  return respuesta;
}

async function subirComprobante(idPedido, clienteToken) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('comprobante', new Blob([png], { type: 'image/png' }), 'fase3.png');
  const respuesta = await peticion(`/cliente/pedidos/${idPedido}/comprobante`, { method: 'POST', body: form }, clienteToken);
  const [rows] = await db.query('SELECT comprobanteRuta FROM pedido_cliente WHERE idPedido=?', [idPedido]);
  if (rows[0]?.comprobanteRuta) archivosPrueba.add(rows[0].comprobanteRuta);
  return respuesta;
}

async function preparar() {
  db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [sucursales] = await db.query('SELECT idSuc FROM sucursal ORDER BY idSuc');
  if (sucursales.length !== 1) throw new Error('Las pruebas requieren exactamente una sucursal antes de iniciar.');
  const idSuc = Number(sucursales[0].idSuc);
  const [admins] = await db.query(`SELECT e.idEmp FROM empleados e JOIN cargo c ON c.idCargo=e.idCargo
    WHERE e.estadoEmp=1 AND c.nombreCargo='ADMINISTRADOR' AND c.idSuc=? LIMIT 1`, [idSuc]);
  const [cajeros] = await db.query(`SELECT e.idEmp FROM empleados e JOIN cargo c ON c.idCargo=e.idCargo
    WHERE e.estadoEmp=1 AND c.nombreCargo='CAJERO' AND c.idSuc=? LIMIT 1`, [idSuc]);
  if (!admins.length || !cajeros.length) throw new Error('Se requiere un administrador y un cajero activos en la sucursal.');
  const [configuraciones] = await db.query('SELECT * FROM configuracion_transferencia WHERE idSuc=?', [idSuc]);
  if (!configuraciones.length) {
    const [result] = await db.query(`INSERT INTO configuracion_transferencia
      (idSuc,banco,titular,clabe,numeroCuenta,instrucciones,activo)
      VALUES (?,'Banco snapshot F3','Titular F3','123456789012345678','F3-001','Datos temporales Fase 3',1)`, [idSuc]);
    idConfiguracionTemporal = Number(result.insertId);
  } else if (!configuraciones[0].activo) {
    throw new Error('La configuración real está desactivada; no se modificará automáticamente para probar.');
  }
  const sufijo = crypto.randomUUID();
  const [cliente] = await db.query(`INSERT INTO cliente
    (nombreCliente,apellidoPatCliente,correoCliente,googleSub,estadoCliente)
    VALUES ('Cliente','Fase Tres',?,?,1)`, [`fase3-${sufijo}@example.invalid`, `fase3-${sufijo}`]);
  idClienteTemporal = Number(cliente.insertId);
  const [productos] = await db.query(`SELECT idPro,nombrePro,existenciaPro,precioVentaPro FROM productos
    WHERE activoPro=1 AND precioVentaPro IS NOT NULL ORDER BY idPro LIMIT 1`);
  if (!productos.length) throw new Error('No hay un producto activo para la prueba.');
  producto = productos[0];
  stockOriginal = Number(producto.existenciaPro);
  precioOriginal = Number(producto.precioVentaPro);
  await db.query('UPDATE productos SET existenciaPro=10 WHERE idPro=?', [producto.idPro]);
  return { idSuc, idAdmin: Number(admins[0].idEmp), idCajero: Number(cajeros[0].idEmp) };
}

async function asegurarCaja(idEmp, idSuc) {
  const [abiertas] = await db.query(`SELECT idSesionCaja FROM sesion_caja
    WHERE idEmp=? AND estado='ABIERTA' ORDER BY idSesionCaja DESC LIMIT 1`, [idEmp]);
  if (abiertas.length) return Number(abiertas[0].idSesionCaja);
  const [result] = await db.query(`INSERT INTO sesion_caja
    (uuidSesionCaja,idEmp,idSuc,fechaHoraApertura,fondoInicial,estado)
    VALUES (?,?,?,NOW(),0,'ABIERTA')`, [crypto.randomUUID(), idEmp, idSuc]);
  sesionesPrueba.add(Number(result.insertId));
  return Number(result.insertId);
}

async function ejecutar() {
  const ids = await preparar();
  servidor = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname, env: { ...process.env, PORT: String(puerto) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  await esperarServidor();
  const clienteToken = token(idClienteTemporal, 'CLIENTE');
  const adminToken = token(ids.idAdmin, 'EMPLEADO');
  const cajeroToken = token(ids.idCajero, 'EMPLEADO');

  let r = await peticion('/admin/pedidos', {}, clienteToken);
  comprobar('Cliente no entra al listado admin', r.status === 401, `HTTP ${r.status}`);
  r = await peticion('/admin/pedidos', {}, cajeroToken);
  comprobar('Cajero no entra al listado admin', r.status === 403, `HTTP ${r.status}`);

  const aprobado = await crearPedido(clienteToken, 2);
  comprobar('Pedido reserva 10 a 8', aprobado.status === 201 && await stock() === 8, `HTTP ${aprobado.status}, stock ${await stock()}`);
  const [snapshot] = await db.query(`SELECT bancoSnapshot,titularSnapshot,clabeSnapshot,
    numeroCuentaSnapshot,instruccionesSnapshot FROM pedido_cliente WHERE idPedido=?`, [aprobado.body.idPedido]);
  comprobar('Pedido guarda cinco snapshots', snapshot[0].bancoSnapshot && snapshot[0].titularSnapshot &&
    snapshot[0].clabeSnapshot && snapshot[0].numeroCuentaSnapshot && snapshot[0].instruccionesSnapshot);
  r = await subirComprobante(aprobado.body.idPedido, clienteToken);
  comprobar('Comprobante conserva stock 8', r.status === 200 && r.body.estado === 'EN_REVISION' && await stock() === 8);
  r = await peticion('/admin/pedidos', {}, adminToken);
  comprobar('Admin lista sólo pedidos de su sucursal', r.status === 200 && r.body.some(p => p.idPedido === aprobado.body.idPedido));
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}`, {}, adminToken);
  comprobar('Admin obtiene detalle seguro', r.status === 200 && !('comprobanteRuta' in r.body) && r.body.cliente.correo);
  comprobar('Detalle utiliza snapshot', r.body.configuracionTransferencia?.banco === snapshot[0].bancoSnapshot);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/comprobante`, {}, adminToken);
  comprobar('Admin abre comprobante privado', r.status === 200 && r.headers.get('content-type')?.includes('image/png'));

  await db.query('UPDATE productos SET precioVentaPro=precioVentaPro+7.25 WHERE idPro=?', [producto.idPro]);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/aprobar`, { method: 'POST', body: '{}' }, adminToken);
  comprobar('Aprobación crea venta y conserva stock 8', r.status === 200 && r.body.estado === 'PAGADO' && r.body.idVenta && await stock() === 8);
  ventasPrueba.add(Number(r.body.idVenta));
  const idVentaAprobada = Number(r.body.idVenta);
  const [ventas] = await db.query('SELECT * FROM venta WHERE idVenta=?', [idVentaAprobada]);
  const [detallesVenta] = await db.query('SELECT * FROM detventa WHERE idVenta=?', [idVentaAprobada]);
  const [detallePedido] = await db.query('SELECT * FROM detalle_pedido_cliente WHERE idPedido=?', [aprobado.body.idPedido]);
  comprobar('Venta online usa transferencia sin caja', ventas[0].metodoPago === 'TRANSFERENCIA' && ventas[0].idSesionCaja === null && ventas[0].montoRecibido === null);
  comprobar('Venta total coincide con pedido', Number(ventas[0].total) === Number(aprobado.body.total));
  comprobar('Detventa conserva precio y subtotal históricos', detallesVenta.length === detallePedido.length &&
    Number(detallesVenta[0].precioUnitarioDetVenta) === Number(detallePedido[0].precioUnitario) &&
    Number(detallesVenta[0].subtotalDetVenta) === Number(detallePedido[0].subtotal));
  r = await peticion('/ventas', {}, adminToken);
  comprobar('Historial identifica la venta online', r.status === 200 &&
    r.body.some(v => v.idVenta === idVentaAprobada && v.origenVenta === 'ONLINE'));
  r = await peticion(`/ventas/${idVentaAprobada}`, {}, adminToken);
  comprobar('Detalle de venta online admite caja nula', r.status === 200 && r.body.origenVenta === 'ONLINE' &&
    r.body.idSesionCaja === null && r.body.folioPedido === aprobado.body.folio);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/aprobar`, { method: 'POST', body: '{}' }, adminToken);
  const [cuentaVentas] = await db.query('SELECT COUNT(*) total FROM venta WHERE idVenta=?', [idVentaAprobada]);
  comprobar('Doble aprobación no duplica venta', r.status === 409 && Number(cuentaVentas[0].total) === 1 && await stock() === 8);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/entregar`, { method: 'POST', body: '{}' }, adminToken);
  comprobar('No permite PAGADO a ENTREGADO', r.status === 409 && await stock() === 8);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/listo`, { method: 'POST', body: '{}' }, adminToken);
  comprobar('PAGADO pasa a LISTO sin tocar stock', r.status === 200 && r.body.estado === 'LISTO' && await stock() === 8);
  r = await peticion(`/admin/pedidos/${aprobado.body.idPedido}/entregar`, { method: 'POST', body: '{}' }, adminToken);
  comprobar('LISTO pasa a ENTREGADO sin tocar stock', r.status === 200 && r.body.estado === 'ENTREGADO' && await stock() === 8);
  r = await peticion(`/ventas/${idVentaAprobada}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: 'No debe cancelarse' }) }, adminToken);
  comprobar('Venta online no se cancela por endpoint POS', r.status === 409 && await stock() === 8);

  await db.query('UPDATE productos SET existenciaPro=10,precioVentaPro=? WHERE idPro=?', [precioOriginal, producto.idPro]);
  const rechazado = await crearPedido(clienteToken, 2);
  await subirComprobante(rechazado.body.idPedido, clienteToken);
  comprobar('Pedido a rechazar conserva reserva 8', await stock() === 8);
  r = await peticion(`/admin/pedidos/${rechazado.body.idPedido}/rechazar`, {
    method: 'POST', body: JSON.stringify({ motivo: 'El comprobante no corresponde al monto.' })
  }, adminToken);
  comprobar('Rechazo restaura 8 a 10', r.status === 200 && r.body.estado === 'RECHAZADO' && await stock() === 10);
  const comprobanteRechazado = r.body.comprobante;
  r = await peticion(`/admin/pedidos/${rechazado.body.idPedido}/rechazar`, {
    method: 'POST', body: JSON.stringify({ motivo: 'Segundo intento' })
  }, adminToken);
  comprobar('Segundo rechazo no restaura doble', r.status === 409 && await stock() === 10);
  r = await peticion(`/admin/pedidos/${rechazado.body.idPedido}`, {}, adminToken);
  comprobar('Rechazo conserva comprobante y motivo', Boolean(comprobanteRechazado) && Boolean(r.body.comprobante) && r.body.motivoRechazo);

  await db.query('UPDATE productos SET existenciaPro=10 WHERE idPro=?', [producto.idPro]);
  const carrera = await crearPedido(clienteToken, 2);
  await subirComprobante(carrera.body.idPedido, clienteToken);
  const [aprobar, rechazar] = await Promise.all([
    peticion(`/admin/pedidos/${carrera.body.idPedido}/aprobar`, { method: 'POST', body: '{}' }, adminToken),
    peticion(`/admin/pedidos/${carrera.body.idPedido}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo: 'Carrera controlada' }) }, adminToken)
  ]);
  const exitosos = [aprobar, rechazar].filter(x => x.status === 200);
  const conflictos = [aprobar, rechazar].filter(x => x.status === 409);
  if (aprobar.status === 200 && aprobar.body.idVenta) ventasPrueba.add(Number(aprobar.body.idVenta));
  const stockCarrera = await stock();
  comprobar('Carrera aprobar/rechazar tiene un ganador', exitosos.length === 1 && conflictos.length === 1 && [8, 10].includes(stockCarrera),
    `aprobar ${aprobar.status}, rechazar ${rechazar.status}, stock ${stockCarrera}`);

  const sufijoSucursal = crypto.randomUUID().slice(0, 8);
  const [sucursal] = await db.query('INSERT INTO sucursal(nombreSuc) VALUES (?)', [`Sucursal prueba F3 ${sufijoSucursal}`]);
  idSucursalTemporal = Number(sucursal.insertId);
  const [pedidoAjeno] = await db.query(`INSERT INTO pedido_cliente
    (uuidPedido,idCliente,idSuc,total,estado,comprobanteRuta,comprobanteMime,comprobanteNombre,fechaComprobante)
    VALUES (?,?,?,1,'EN_REVISION',?,'image/png','ajeno.png',NOW())`, [
    crypto.randomUUID(), idClienteTemporal, idSucursalTemporal, [...archivosPrueba][0]
  ]);
  pedidosPrueba.add(Number(pedidoAjeno.insertId));
  r = await peticion('/admin/pedidos', {}, adminToken);
  comprobar('Listado excluye pedidos de otra sucursal', r.status === 200 && !r.body.some(p => p.idPedido === pedidoAjeno.insertId));
  r = await peticion(`/admin/pedidos/${pedidoAjeno.insertId}`, {}, adminToken);
  comprobar('Pedido de otra sucursal devuelve 404', r.status === 404);
  r = await peticion(`/admin/pedidos/${pedidoAjeno.insertId}/comprobante`, {}, adminToken);
  comprobar('Comprobante de otra sucursal devuelve 404', r.status === 404);

  await db.query('UPDATE productos SET existenciaPro=10 WHERE idPro=?', [producto.idPro]);
  await asegurarCaja(ids.idCajero, ids.idSuc);
  r = await peticion('/ventas', { method: 'POST', body: JSON.stringify({
    uuidVenta: crypto.randomUUID(), items: [{ idPro: producto.idPro, cantidad: 1 }],
    metodoPago: 'EFECTIVO', montoRecibido: 999999
  }) }, cajeroToken);
  comprobar('Venta POS temporal se registra', r.status === 201 && await stock() === 9, `HTTP ${r.status}`);
  ventasPrueba.add(Number(r.body.idVenta));
  r = await peticion(`/ventas/${r.body.idVenta}/cancelar`, {
    method: 'POST', body: JSON.stringify({ motivo: 'Cancelación POS de prueba' })
  }, adminToken);
  comprobar('Venta POS normal sigue cancelándose', r.status === 200 && await stock() === 10, `HTTP ${r.status}`);

  console.log(JSON.stringify({ resultado: 'FASE_3_BACKEND_OK', pruebas: resultados,
    inventarioAprobacion: '10 -> 8 -> 8 -> 8 -> 8', inventarioRechazo: '10 -> 8 -> 10' }, null, 2));
}

async function limpiar() {
  if (servidor) servidor.kill();
  if (!db) return;
  try {
    await db.beginTransaction();
    for (const idPedido of pedidosPrueba) {
      const [rows] = await db.query('SELECT idVenta,comprobanteRuta FROM pedido_cliente WHERE idPedido=? FOR UPDATE', [idPedido]);
      if (!rows.length) continue;
      if (rows[0].comprobanteRuta) archivosPrueba.add(rows[0].comprobanteRuta);
      if (rows[0].idVenta) ventasPrueba.add(Number(rows[0].idVenta));
      await db.query('UPDATE pedido_cliente SET idVenta=NULL WHERE idPedido=?', [idPedido]);
      await db.query('DELETE FROM detalle_pedido_cliente WHERE idPedido=?', [idPedido]);
      await db.query('DELETE FROM pedido_cliente WHERE idPedido=?', [idPedido]);
    }
    for (const idVenta of ventasPrueba) {
      await db.query('DELETE FROM detventa WHERE idVenta=?', [idVenta]);
      await db.query('DELETE FROM venta WHERE idVenta=?', [idVenta]);
    }
    for (const idSesion of sesionesPrueba) await db.query('DELETE FROM sesion_caja WHERE idSesionCaja=?', [idSesion]);
    if (idClienteTemporal) await db.query('DELETE FROM cliente WHERE idCliente=?', [idClienteTemporal]);
    if (idConfiguracionTemporal) await db.query('DELETE FROM configuracion_transferencia WHERE idConfiguracion=?', [idConfiguracionTemporal]);
    if (idSucursalTemporal) await db.query('DELETE FROM sucursal WHERE idSuc=?', [idSucursalTemporal]);
    if (producto) await db.query('UPDATE productos SET existenciaPro=?,precioVentaPro=? WHERE idPro=?', [stockOriginal, precioOriginal, producto.idPro]);
    await db.commit();
    for (const nombre of archivosPrueba) {
      if (path.basename(nombre) !== nombre) continue;
      const ruta = path.join(__dirname, 'uploads', 'comprobantes', nombre);
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
  } catch (error) {
    await db.rollback().catch(() => undefined);
    console.error('TEST_CLEANUP_ERROR', error.message);
  }
  await db.end();
}

ejecutar().catch(error => {
  console.error('FASE_3_BACKEND_FAIL', error.message); process.exitCode = 1;
}).finally(limpiar);
