const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const baseUrl = `http://127.0.0.1:${Number(process.env.PORT) || 3000}`;
const resultados = [];
const pedidosPrueba = new Set();
let servidor;
let db;
let idClienteTemporal = null;
let idConfiguracionTemporal = null;
let producto;
let stockOriginal;

function token(sub, tipo) {
  return jwt.sign({ sub: String(sub), tipo }, process.env.JWT_SECRET, { expiresIn: '15m', issuer: 'tienda-api' });
}

async function peticion(ruta, opciones = {}, bearer = null) {
  const headers = { ...(opciones.headers || {}) };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (opciones.body && !(opciones.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const respuesta = await fetch(`${baseUrl}${ruta}`, { ...opciones, headers });
  const tipo = respuesta.headers.get('content-type') || '';
  const cuerpo = tipo.includes('json') ? await respuesta.json() : await respuesta.arrayBuffer();
  return { status: respuesta.status, body: cuerpo };
}

function comprobar(nombre, condicion, detalle = '') {
  if (!condicion) throw new Error(`${nombre}: ${detalle || 'resultado inesperado'}`);
  resultados.push({ prueba: nombre, resultado: 'OK' });
}

async function esperarServidor() {
  for (let intento = 0; intento < 40; intento += 1) {
    try {
      await fetch(`${baseUrl}/public/tienda`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('El backend de prueba no inició a tiempo.');
}

async function stock() {
  const [rows] = await db.query('SELECT existenciaPro FROM productos WHERE idPro = ?', [producto.idPro]);
  return Number(rows[0].existenciaPro);
}

async function crearPedido(clienteToken, cantidad, uuid = crypto.randomUUID(), extra = {}) {
  const respuesta = await peticion(
    '/cliente/pedidos',
    {
      method: 'POST',
      body: JSON.stringify({ uuidPedido: uuid, items: [{ idPro: producto.idPro, cantidad }], ...extra }),
    },
    clienteToken,
  );
  if (respuesta.body?.idPedido) pedidosPrueba.add(Number(respuesta.body.idPedido));
  return { ...respuesta, uuid };
}

async function cancelar(idPedido, clienteToken) {
  return peticion(`/cliente/pedidos/${idPedido}/cancelar`, { method: 'POST', body: '{}' }, clienteToken);
}

async function preparar() {
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [sucursales] = await db.query('SELECT idSuc FROM sucursal ORDER BY idSuc');
  if (sucursales.length !== 1) throw new Error('Las pruebas requieren exactamente una sucursal.');
  const idSuc = Number(sucursales[0].idSuc);
  const [configuraciones] = await db.query('SELECT idConfiguracion FROM configuracion_transferencia WHERE idSuc = ?', [
    idSuc,
  ]);
  if (!configuraciones.length) {
    const [result] = await db.query(
      `INSERT INTO configuracion_transferencia
      (idSuc,banco,titular,numeroCuenta,instrucciones,activo) VALUES (?,'Banco de prueba','Pruebas Fase 2','00000001','Configuración temporal de pruebas',1)`,
      [idSuc],
    );
    idConfiguracionTemporal = Number(result.insertId);
  }
  const [clientes] = await db.query('SELECT idCliente FROM cliente WHERE estadoCliente=1 ORDER BY idCliente LIMIT 1');
  if (!clientes.length) throw new Error('No existe un cliente activo para probar.');
  const idCliente = Number(clientes[0].idCliente);
  const sufijo = crypto.randomUUID();
  const [clienteTemporal] = await db.query(
    `INSERT INTO cliente
    (nombreCliente,correoCliente,googleSub,estadoCliente) VALUES ('Cliente prueba',?,?,1)`,
    [`fase2-${sufijo}@example.invalid`, `fase2-${sufijo}`],
  );
  idClienteTemporal = Number(clienteTemporal.insertId);
  const [productos] = await db.query(`SELECT idPro,nombrePro,existenciaPro,precioVentaPro FROM productos
    WHERE activoPro=1 AND existenciaPro>=3 AND precioVentaPro IS NOT NULL ORDER BY existenciaPro DESC LIMIT 1`);
  if (!productos.length) throw new Error('No hay un producto activo con stock suficiente para probar.');
  producto = productos[0];
  stockOriginal = Number(producto.existenciaPro);
  const [administradores] = await db.query(`SELECT e.idEmp FROM empleados e JOIN cargo c ON c.idCargo=e.idCargo
    WHERE e.estadoEmp=1 AND c.nombreCargo='ADMINISTRADOR' LIMIT 1`);
  const [cajeros] = await db.query(`SELECT e.idEmp FROM empleados e JOIN cargo c ON c.idCargo=e.idCargo
    WHERE e.estadoEmp=1 AND c.nombreCargo='CAJERO' LIMIT 1`);
  return {
    idCliente,
    idCliente2: idClienteTemporal,
    idAdmin: Number(administradores[0]?.idEmp || 0),
    idCajero: Number(cajeros[0]?.idEmp || 0),
  };
}

async function ejecutar() {
  const ids = await preparar();
  servidor = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await esperarServidor();
  const cliente1 = token(ids.idCliente, 'CLIENTE');
  const cliente2 = token(ids.idCliente2, 'CLIENTE');
  const empleado = token(ids.idAdmin || ids.idCajero, 'EMPLEADO');

  let r = await peticion('/cliente/pedidos', { method: 'POST', body: '{}' });
  comprobar('Sin JWT cliente', r.status === 401, `HTTP ${r.status}`);
  r = await peticion('/cliente/pedidos', { method: 'POST', body: '{}' }, empleado);
  comprobar('JWT empleado rechazado', r.status === 401, `HTTP ${r.status}`);
  r = await peticion('/cliente/configuracion-transferencia', {}, cliente1);
  comprobar(
    'Configuración cliente protegida disponible',
    r.status === 200 && !('idConfiguracion' in r.body.configuracion),
    `HTTP ${r.status}`,
  );
  if (ids.idAdmin) {
    r = await peticion('/configuracion/transferencia', {}, token(ids.idAdmin, 'EMPLEADO'));
    comprobar('Configuración admin', r.status === 200, `HTTP ${r.status}`);
  }
  if (ids.idCajero) {
    r = await peticion('/configuracion/transferencia', {}, token(ids.idCajero, 'EMPLEADO'));
    comprobar('Cajero no puede configurar transferencias', r.status === 403, `HTTP ${r.status}`);
  }

  const uuidIdempotente = crypto.randomUUID();
  const creado = await crearPedido(cliente1, 2, uuidIdempotente, { total: 0.01, precio: 0.01 });
  comprobar(
    'Pedido válido y reserva',
    creado.status === 201 && (await stock()) === stockOriginal - 2,
    `HTTP ${creado.status}`,
  );
  comprobar(
    'Precio y total reales',
    Number(creado.body.total) === Number(producto.precioVentaPro) * 2,
    `total ${creado.body.total}`,
  );
  const repetido = await crearPedido(cliente1, 2, uuidIdempotente);
  comprobar(
    'Idempotencia mismo cliente',
    repetido.status === 200 && repetido.body.idPedido === creado.body.idPedido && (await stock()) === stockOriginal - 2,
  );
  r = await crearPedido(cliente2, 1, uuidIdempotente);
  comprobar('UUID de otro cliente', r.status === 409, `HTTP ${r.status}`);
  r = await cancelar(creado.body.idPedido, cliente1);
  comprobar(
    'Cancelar restaura stock',
    r.status === 200 && r.body.estado === 'CANCELADO' && (await stock()) === stockOriginal,
  );
  r = await cancelar(creado.body.idPedido, cliente1);
  comprobar('Cancelar dos veces no restaura doble', r.status === 409 && (await stock()) === stockOriginal);

  r = await crearPedido(cliente1, stockOriginal + 1);
  comprobar(
    'Stock insuficiente conserva inventario',
    r.status === 409 && (await stock()) === stockOriginal,
    `HTTP ${r.status}`,
  );

  await db.query('UPDATE productos SET existenciaPro=1 WHERE idPro=?', [producto.idPro]);
  const [conA, conB] = await Promise.all([crearPedido(cliente1, 1), crearPedido(cliente2, 1)]);
  const exitosos = [conA, conB].filter((x) => x.status === 201),
    conflictos = [conA, conB].filter((x) => x.status === 409);
  const stockConcurrente = await stock();
  comprobar(
    'Concurrencia último producto',
    exitosos.length === 1 && conflictos.length === 1 && stockConcurrente === 0,
    `HTTP A=${conA.status}, B=${conB.status}, stock=${stockConcurrente}`,
  );
  const ganadorToken = conA.status === 201 ? cliente1 : cliente2;
  await cancelar(exitosos[0].body.idPedido, ganadorToken);
  comprobar('Restauración tras concurrencia', (await stock()) === 1);
  await db.query('UPDATE productos SET existenciaPro=? WHERE idPro=?', [stockOriginal, producto.idPro]);

  const expira = await crearPedido(cliente1, 1);
  await db.query('UPDATE pedido_cliente SET fechaLimitePago=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE idPedido=?', [
    expira.body.idPedido,
  ]);
  r = await peticion('/cliente/pedidos', {}, cliente1);
  const expirado = r.body.find((p) => p.idPedido === expira.body.idPedido);
  comprobar('Expiración restaura stock', expirado?.estado === 'EXPIRADO' && (await stock()) === stockOriginal);
  await peticion('/cliente/pedidos', {}, cliente1);
  comprobar('Expiración idempotente', (await stock()) === stockOriginal);

  const comprobante = await crearPedido(cliente1, 1);
  const stockReservado = await stock();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.append('comprobante', new Blob([png], { type: 'image/png' }), 'prueba.png');
  r = await peticion(
    `/cliente/pedidos/${comprobante.body.idPedido}/comprobante`,
    { method: 'POST', body: form },
    cliente1,
  );
  comprobar('Comprobante válido pasa a EN_REVISION', r.status === 200 && r.body.estado === 'EN_REVISION');
  comprobar('Comprobante no cambia stock', (await stock()) === stockReservado);
  r = await peticion(`/cliente/pedidos/${comprobante.body.idPedido}/comprobante`, {}, cliente2);
  comprobar('Comprobante ajeno protegido', r.status === 404);
  r = await cancelar(comprobante.body.idPedido, cliente1);
  comprobar('EN_REVISION no permite cancelar', r.status === 409 && (await stock()) === stockReservado);

  const ajeno = await crearPedido(cliente1, 1);
  const formAjeno = new FormData();
  formAjeno.append('comprobante', new Blob([png], { type: 'image/png' }), 'ajeno.png');
  r = await peticion(
    `/cliente/pedidos/${ajeno.body.idPedido}/comprobante`,
    { method: 'POST', body: formAjeno },
    cliente2,
  );
  comprobar('Subida a pedido ajeno rechazada', r.status === 404);
  await cancelar(ajeno.body.idPedido, cliente1);

  const vencido = await crearPedido(cliente1, 1);
  await db.query('UPDATE pedido_cliente SET fechaLimitePago=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE idPedido=?', [
    vencido.body.idPedido,
  ]);
  const formVencido = new FormData();
  formVencido.append('comprobante', new Blob([png], { type: 'image/png' }), 'vencido.png');
  r = await peticion(
    `/cliente/pedidos/${vencido.body.idPedido}/comprobante`,
    { method: 'POST', body: formVencido },
    cliente1,
  );
  comprobar('Comprobante de pedido expirado rechazado', r.status === 409 && (await stock()) === stockReservado);

  const invalido = await crearPedido(cliente1, 1);
  const formInvalido = new FormData();
  formInvalido.append('comprobante', new Blob(['no es png'], { type: 'image/png' }), 'falso.png');
  r = await peticion(
    `/cliente/pedidos/${invalido.body.idPedido}/comprobante`,
    { method: 'POST', body: formInvalido },
    cliente1,
  );
  comprobar('Firma MIME inválida rechazada', r.status === 400);
  await cancelar(invalido.body.idPedido, cliente1);
  const grande = await crearPedido(cliente1, 1);
  const formGrande = new FormData();
  formGrande.append('comprobante', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'grande.png');
  r = await peticion(
    `/cliente/pedidos/${grande.body.idPedido}/comprobante`,
    { method: 'POST', body: formGrande },
    cliente1,
  );
  comprobar('Comprobante mayor a 5 MB rechazado', r.status === 400);
  await cancelar(grande.body.idPedido, cliente1);

  console.log(JSON.stringify({ resultado: 'FASE_2_BACKEND_OK', pruebas: resultados }, null, 2));
}

async function limpiar() {
  if (servidor) servidor.kill();
  if (!db) return;
  try {
    await db.beginTransaction();
    for (const idPedido of pedidosPrueba) {
      const [pedidos] = await db.query(
        'SELECT estado,comprobanteRuta FROM pedido_cliente WHERE idPedido=? FOR UPDATE',
        [idPedido],
      );
      if (!pedidos.length) continue;
      if (['PENDIENTE_PAGO', 'EN_REVISION'].includes(pedidos[0].estado)) {
        const [detalles] = await db.query(
          'SELECT idPro,cantidad FROM detalle_pedido_cliente WHERE idPedido=? ORDER BY idPro',
          [idPedido],
        );
        for (const detalle of detalles)
          await db.query('UPDATE productos SET existenciaPro=existenciaPro+? WHERE idPro=?', [
            detalle.cantidad,
            detalle.idPro,
          ]);
      }
      if (pedidos[0].comprobanteRuta) {
        const ruta = path.join(__dirname, 'uploads', 'comprobantes', path.basename(pedidos[0].comprobanteRuta));
        if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
      }
      await db.query('DELETE FROM detalle_pedido_cliente WHERE idPedido=?', [idPedido]);
      await db.query('DELETE FROM pedido_cliente WHERE idPedido=?', [idPedido]);
    }
    if (producto) await db.query('UPDATE productos SET existenciaPro=? WHERE idPro=?', [stockOriginal, producto.idPro]);
    if (idClienteTemporal) await db.query('DELETE FROM cliente WHERE idCliente=?', [idClienteTemporal]);
    if (idConfiguracionTemporal)
      await db.query('DELETE FROM configuracion_transferencia WHERE idConfiguracion=?', [idConfiguracionTemporal]);
    await db.commit();
  } catch (error) {
    await db.rollback().catch(() => undefined);
    console.error('TEST_CLEANUP_ERROR', error.message);
  }
  await db.end();
}

ejecutar()
  .catch((error) => {
    console.error('FASE_2_BACKEND_FAIL', error.message);
    process.exitCode = 1;
  })
  .finally(limpiar);
