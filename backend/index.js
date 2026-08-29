const path = require('path');
const entornoLocal = require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true }).parsed || {};
process.env.JWT_SECRET = entornoLocal.JWT_SECRET?.trim() || '';

if (!process.env.JWT_SECRET?.trim()) {
  throw new Error('JWT_SECRET no está configurado. Define el valor en backend/.env antes de iniciar el servidor.');
}

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

const productosUploadDir = path.join(__dirname, 'uploads', 'productos');
const tiendaUploadDir = path.join(__dirname, 'uploads', 'tienda');
const comprobantesUploadDir = path.join(__dirname, 'uploads', 'comprobantes');
fs.mkdirSync(productosUploadDir, { recursive: true });
fs.mkdirSync(tiendaUploadDir, { recursive: true });
fs.mkdirSync(comprobantesUploadDir, { recursive: true });
app.use(
  '/uploads/productos',
  express.static(productosUploadDir, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '1d',
  }),
);
app.use(
  '/uploads/tienda',
  express.static(tiendaUploadDir, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '1d',
  }),
);

const extensionesImagen = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);
function crearUploadImagen(directorio) {
  return multer({
    storage: multer.diskStorage({
      destination: directorio,
      filename: (req, file, callback) =>
        callback(null, `${crypto.randomUUID()}${extensionesImagen.get(file.mimetype) || ''}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
      if (!extensionesImagen.has(file.mimetype)) {
        return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'imagen'));
      }
      callback(null, true);
    },
  });
}

const uploadImagen = crearUploadImagen(productosUploadDir);
const uploadLogo = crearUploadImagen(tiendaUploadDir);

const extensionesComprobante = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);
const uploadComprobante = multer({
  storage: multer.diskStorage({
    destination: comprobantesUploadDir,
    filename: (req, file, callback) =>
      callback(null, `${crypto.randomUUID()}${extensionesComprobante.get(file.mimetype) || ''}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!extensionesComprobante.has(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'comprobante'));
    }
    callback(null, true);
  },
});

const db = mysql
  .createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
  })
  .promise();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const empleadoSesionSelect = `
  SELECT e.idEmp, e.nombreEmp, e.apellidoPatEmp, e.apellidoMatEmp, e.correoEmp,
    e.contrasenaHash, e.estadoEmp, e.googleSub, e.telefono, e.fotoPerfil, e.fechaIngreso,
    e.idCargo, c.nombreCargo AS cargo, c.idSuc, s.nombreSuc
  FROM empleados e
  LEFT JOIN cargo c ON c.idCargo = e.idCargo
  LEFT JOIN sucursal s ON s.idSuc = c.idSuc
`;

const clienteSesionSelect = `
  SELECT idCliente, nombreCliente, apellidoPatCliente, apellidoMatCliente,
    correoCliente, googleSub, fotoPerfil, estadoCliente, fechaRegistro, ultimoAcceso
  FROM cliente
`;

function empleadoSeguro(empleado) {
  return {
    idEmp: empleado.idEmp,
    nombre: [empleado.nombreEmp, empleado.apellidoPatEmp, empleado.apellidoMatEmp].filter(Boolean).join(' '),
    nombreEmp: empleado.nombreEmp,
    apellidoPatEmp: empleado.apellidoPatEmp,
    apellidoMatEmp: empleado.apellidoMatEmp,
    correo: empleado.correoEmp,
    telefono: empleado.telefono,
    fechaIngreso: empleado.fechaIngreso,
    fotoPerfil: empleado.fotoPerfil,
    idCargo: empleado.idCargo,
    cargo: empleado.cargo,
    idSuc: empleado.idSuc,
    nombreSuc: empleado.nombreSuc,
    estadoEmp: Boolean(empleado.estadoEmp),
  };
}

function clienteSeguro(cliente) {
  return {
    idCliente: Number(cliente.idCliente),

    nombre: cliente.nombreCliente,

    apellidoPat: cliente.apellidoPatCliente,

    apellidoMat: cliente.apellidoMatCliente,

    correo: cliente.correoCliente,

    fotoPerfil: cliente.fotoPerfil,

    estadoCliente: Boolean(cliente.estadoCliente),

    fechaRegistro: cliente.fechaRegistro,

    ultimoAcceso: cliente.ultimoAcceso,

    rol: 'CLIENTE',
  };
}

function emitirSesion(empleado) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no está configurado');
  return jwt.sign({ sub: String(empleado.idEmp), tipo: 'EMPLEADO' }, process.env.JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'tienda-api',
  });
}
function emitirSesionCliente(cliente) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no está configurado');
  }

  return jwt.sign(
    {
      sub: String(cliente.idCliente),

      tipo: 'CLIENTE',
    },

    process.env.JWT_SECRET,

    {
      expiresIn: '12h',
      issuer: 'tienda-api',
    },
  );
}
async function autenticar(req, res, next) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ message: 'Sesión no válida' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'tienda-api',
    });

    /*
     * Un token CLIENTE nunca puede utilizar
     * las rutas administrativas / POS.
     */

    if (payload.tipo && payload.tipo !== 'EMPLEADO') {
      return res.status(401).json({
        message: 'Sesión no válida',
      });
    }

    const idEmp = idValido(payload.sub);
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE e.idEmp = ?`, [idEmp]);
    const empleado = rows[0];
    if (!empleado || !empleado.estadoEmp || !empleado.cargo)
      return res.status(401).json({ message: 'Sesión no válida' });
    req.empleado = empleado;
    next();
  } catch {
    return res.status(401).json({ message: 'Sesión no válida' });
  }
}

async function autenticarCliente(req, res, next) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];

  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({
      message: 'Sesión no válida',
    });
  }

  try {
    const payload = jwt.verify(
      token,

      process.env.JWT_SECRET,

      {
        issuer: 'tienda-api',
      },
    );

    if (payload.tipo !== 'CLIENTE') {
      return res.status(401).json({
        message: 'Sesión no válida',
      });
    }

    const idCliente = idValido(payload.sub);

    if (!idCliente) {
      return res.status(401).json({
        message: 'Sesión no válida',
      });
    }

    const [rows] = await db.query(`${clienteSesionSelect} WHERE idCliente = ?`, [idCliente]);

    const cliente = rows[0];

    if (!cliente || !cliente.estadoCliente) {
      return res.status(401).json({
        message: 'Sesión no válida',
      });
    }

    req.cliente = cliente;

    next();
  } catch {
    return res.status(401).json({
      message: 'Sesión no válida',
    });
  }
}
function autorizarRoles(...roles) {
  return (req, res, next) =>
    roles.includes(req.empleado?.cargo)
      ? next()
      : res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
}

const productoSelect = `
  SELECT
    p.idPro,
    p.nombrePro,
    p.precioVentaPro,
    p.costoPro,
    p.existenciaPro,
    p.stockMinimoPro,
    p.tamanoPro,
    p.presentacionPro,
    p.tipoPro,
    p.codigoQR,
    p.skuPro,
    p.imagenPro,
    p.idMarca,
    p.idCat,
    m.nombreMarca,
    c.nombreCat
  FROM productos p
  LEFT JOIN marca m ON m.idMarca = p.idMarca
  LEFT JOIN categoria c ON c.idCat = p.idCat
`;

function idValido(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function texto(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textoNullable(value) {
  return texto(value) || null;
}

function validarSucursal(sucursal) {
  const limites = {
    nombreSuc: 100,
    descripcionSuc: 255,
    telefonoSuc: 15,
    correoSuc: 100,
    paginaWebSuc: 100,
    redSocialSuc: 100,
  };
  for (const [campo, limite] of Object.entries(limites)) {
    if (texto(sucursal[campo]).length > limite) return `El campo ${campo} no puede superar ${limite} caracteres`;
  }
  const correo = texto(sucursal.correoSuc);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return 'El correo no tiene un formato válido';
  const paginaWeb = texto(sucursal.paginaWebSuc);
  if (paginaWeb) {
    try {
      const url = new URL(paginaWeb);
      if (!['http:', 'https:'].includes(url.protocol)) return 'La página web debe usar http o https';
    } catch {
      return 'La página web no es una URL válida';
    }
  }
  return null;
}

const sucursalSelect = `
  SELECT s.idSuc, s.nombreSuc, s.descripcionSuc, s.telefonoSuc, s.correoSuc,
    s.paginaWebSuc, s.redSocialSuc, s.logoSuc, s.idDir,
    CASE WHEN d.idDir IS NULL THEN NULL ELSE CONCAT_WS(', ',
      NULLIF(d.calle, ''), NULLIF(CONCAT_WS(' ', NULLIF(d.noExt, ''), NULLIF(d.noInt, '')), ''),
      NULLIF(d.colonia, ''), NULLIF(d.municipio, ''), NULLIF(d.estado, ''),
      NULLIF(d.codPostal, ''), NULLIF(d.pais, '')) END AS direccion
  FROM sucursal s LEFT JOIN direccion d ON d.idDir = s.idDir
`;

async function obtenerSucursal(idSuc) {
  const [rows] = await db.query(`${sucursalSelect} WHERE s.idSuc = ?`, [idSuc]);
  return rows[0] || null;
}

function valoresSucursal(sucursal) {
  return [
    textoNullable(sucursal.nombreSuc),
    textoNullable(sucursal.descripcionSuc),
    textoNullable(sucursal.telefonoSuc),
    textoNullable(sucursal.correoSuc),
    textoNullable(sucursal.paginaWebSuc),
    textoNullable(sucursal.redSocialSuc),
  ];
}

function eliminarUploadControlado(rutaPublica, directorio, prefijo) {
  if (!rutaPublica || !rutaPublica.startsWith(prefijo)) return;
  const nombre = path.basename(rutaPublica);
  const ruta = path.join(directorio, nombre);
  if (path.dirname(ruta) === directorio) fs.unlink(ruta, () => undefined);
}

function validarProducto(producto) {
  if (!texto(producto.nombre)) return 'El nombre del producto es obligatorio';
  if (!Number.isFinite(Number(producto.precio)) || Number(producto.precio) < 0) {
    return 'El precio de venta debe ser un número mayor o igual a cero';
  }
  if (!Number.isInteger(Number(producto.existencia)) || Number(producto.existencia) < 0) {
    return 'La existencia debe ser un entero mayor o igual a cero';
  }
  if (
    producto.costo !== null &&
    producto.costo !== undefined &&
    producto.costo !== '' &&
    (!Number.isFinite(Number(producto.costo)) || Number(producto.costo) < 0)
  ) {
    return 'El costo debe ser un número mayor o igual a cero';
  }
  if (
    producto.stockMinimo !== null &&
    producto.stockMinimo !== undefined &&
    producto.stockMinimo !== '' &&
    (!Number.isInteger(Number(producto.stockMinimo)) || Number(producto.stockMinimo) < 0)
  ) {
    return 'El stock mínimo debe ser un entero mayor o igual a cero';
  }
  if (!idValido(producto.idMarca)) return 'Selecciona una marca válida';
  if (!idValido(producto.idCat)) return 'Selecciona una categoría válida';
  return null;
}

function valoresProducto(producto) {
  return [
    texto(producto.nombre),
    Number(producto.precio),
    producto.costo === null || producto.costo === undefined || producto.costo === '' ? null : Number(producto.costo),
    Number(producto.existencia),
    producto.stockMinimo === null || producto.stockMinimo === undefined || producto.stockMinimo === ''
      ? null
      : Number(producto.stockMinimo),
    texto(producto.tamano),
    texto(producto.presentacion),
    texto(producto.tipo),
    texto(producto.codigoQR) || null,
    texto(producto.sku) || null,
    texto(producto.imagen) || null,
    Number(producto.idMarca),
    Number(producto.idCat),
  ];
}

function errorServidor(res, error) {
  console.error(error);
  if (error && error.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: 'No se puede eliminar porque el registro está en uso' });
  }
  return res.status(500).json({ message: 'Ocurrió un error interno en el servidor' });
}

async function obtenerProducto(idPro, executor = db) {
  const [rows] = await executor.query(`${productoSelect} WHERE p.idPro = ?`, [idPro]);
  return rows[0] || null;
}

async function validarCatalogosProducto(producto) {
  const [[marcas], [categorias]] = await Promise.all([
    db.query('SELECT idMarca FROM marca WHERE idMarca = ?', [producto.idMarca]),
    db.query('SELECT idCat FROM categoria WHERE idCat = ?', [producto.idCat]),
  ]);
  if (marcas.length === 0) return 'La marca seleccionada no existe';
  if (categorias.length === 0) return 'La categoría seleccionada no existe';
  return null;
}

async function codigoEnUso(codigoQR, idPro = 0) {
  const codigo = texto(codigoQR);
  if (!codigo) return false;
  const [rows] = await db.query('SELECT idPro FROM productos WHERE codigoQR = ? AND idPro <> ?', [codigo, idPro]);
  return rows.length > 0;
}

app.get('/public/tienda', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT idSuc, nombreSuc, descripcionSuc, logoSuc FROM sucursal ORDER BY idSuc');
    res.json(rows);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/public/productos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.idPro, p.nombrePro, p.precioVentaPro, p.existenciaPro, p.tamanoPro,
        p.presentacionPro, p.tipoPro, p.imagenPro, m.nombreMarca, c.nombreCat
      FROM productos p
      LEFT JOIN marca m ON m.idMarca = p.idMarca
      LEFT JOIN categoria c ON c.idCat = p.idCat
      ORDER BY p.nombrePro
    `);
    res.json(rows);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
  const correo = texto(req.body.correo).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!correo || !password) return res.status(400).json({ message: 'Correo y contraseña son obligatorios' });
  try {
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE LOWER(e.correoEmp) = ?`, [correo]);
    const empleado = rows[0];
    if (!empleado?.contrasenaHash || !(await bcrypt.compare(password, empleado.contrasenaHash))) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }
    if (!empleado.estadoEmp) return res.status(403).json({ message: 'Tu cuenta está desactivada' });
    if (!['ADMINISTRADOR', 'CAJERO'].includes(empleado.cargo)) {
      return res.status(403).json({ message: 'Tu cuenta no tiene un cargo autorizado' });
    }
    res.json({ token: emitirSesion(empleado), empleado: empleadoSeguro(empleado) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/auth/google', loginLimiter, async (req, res) => {
  const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
  if (!idToken) return res.status(400).json({ message: 'Falta la credencial de Google' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google aún no está configurado' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const perfil = ticket.getPayload();
    if (!perfil?.sub || !perfil.email || perfil.email_verified !== true) {
      return res.status(401).json({ message: 'No fue posible verificar la cuenta de Google' });
    }
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE LOWER(e.correoEmp) = ?`, [perfil.email.toLowerCase()]);
    const empleado = rows[0];
    if (!empleado) return res.status(403).json({ message: 'Esta cuenta no está autorizada para acceder' });
    if (!empleado.estadoEmp) return res.status(403).json({ message: 'Tu cuenta está desactivada' });
    if (!['ADMINISTRADOR', 'CAJERO'].includes(empleado.cargo)) {
      return res.status(403).json({ message: 'Tu cuenta no tiene un cargo autorizado' });
    }
    if (empleado.googleSub && empleado.googleSub !== perfil.sub) {
      return res.status(403).json({ message: 'Esta cuenta Google no coincide con la cuenta vinculada' });
    }
    if (!empleado.googleSub)
      await db.query('UPDATE empleados SET googleSub = ? WHERE idEmp = ?', [perfil.sub, empleado.idEmp]);
    res.json({ token: emitirSesion(empleado), empleado: empleadoSeguro(empleado) });
  } catch (error) {
    console.error('No fue posible verificar Google:', error.message);
    res.status(401).json({ message: 'No fue posible verificar la cuenta de Google' });
  }
});

async function resolverClienteGoogle(perfil, intento = 0) {
  const correo = perfil.email.trim().toLowerCase().slice(0, 150);
  const googleSub = perfil.sub.trim().slice(0, 255);
  const nombreCompleto = texto(perfil.name);
  const nombre = (texto(perfil.given_name) || nombreCompleto || correo.split('@')[0]).slice(0, 100);
  const apellidoPat = texto(perfil.family_name).slice(0, 100) || null;
  const fotoPerfil = texto(perfil.picture) || null;
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let [rows] = await connection.query(`${clienteSesionSelect} WHERE googleSub = ? FOR UPDATE`, [googleSub]);
    let cliente = rows[0];

    if (!cliente) {
      [rows] = await connection.query(`${clienteSesionSelect} WHERE LOWER(correoCliente) = ? FOR UPDATE`, [correo]);
      cliente = rows[0];
      if (cliente?.googleSub !== undefined && cliente.googleSub !== googleSub) {
        const error = new Error('Esta cuenta Google no coincide con la cuenta de cliente vinculada');
        error.status = 403;
        throw error;
      }
    }

    if (cliente && !cliente.estadoCliente) {
      const error = new Error('Tu cuenta de cliente está desactivada');
      error.status = 403;
      throw error;
    }

    let idCliente = cliente?.idCliente;
    if (!cliente) {
      const [insertado] = await connection.query(
        `
        INSERT INTO cliente
          (nombreCliente, apellidoPatCliente, apellidoMatCliente, correoCliente, googleSub, fotoPerfil, estadoCliente, ultimoAcceso)
        VALUES (?, ?, NULL, ?, ?, ?, 1, NOW())
      `,
        [nombre, apellidoPat, correo, googleSub, fotoPerfil],
      );
      idCliente = insertado.insertId;
    } else {
      await connection.query(
        `
        UPDATE cliente SET ultimoAcceso = NOW(), fotoPerfil = COALESCE(?, fotoPerfil)
        WHERE idCliente = ?
      `,
        [fotoPerfil, idCliente],
      );
    }

    [rows] = await connection.query(`${clienteSesionSelect} WHERE idCliente = ?`, [idCliente]);
    await connection.commit();
    return rows[0];
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.code === 'ER_DUP_ENTRY' && intento === 0) return resolverClienteGoogle(perfil, 1);
    throw error;
  } finally {
    connection?.release();
  }
}

app.post('/auth/google/cliente', loginLimiter, async (req, res) => {
  const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
  if (!idToken) return res.status(400).json({ message: 'Falta la credencial de Google' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google aún no está configurado' });

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const perfil = ticket.getPayload();
    if (!perfil?.sub || !perfil.email || perfil.email_verified !== true) {
      return res.status(401).json({ message: 'No fue posible verificar la cuenta de Google' });
    }
    const cliente = await resolverClienteGoogle(perfil);
    res.json({ token: emitirSesionCliente(cliente), cliente: clienteSeguro(cliente) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('No fue posible verificar Google para cliente:', error.message);
    res.status(401).json({ message: 'No fue posible verificar la cuenta de Google' });
  }
});

app.get('/auth/me', autenticar, (req, res) => res.json({ empleado: empleadoSeguro(req.empleado) }));
app.get('/auth/cliente/me', autenticarCliente, (req, res) => res.json({ cliente: clienteSeguro(req.cliente) }));

app.get('/productos', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [productos] = await db.query(`${productoSelect} ORDER BY p.nombrePro`);
    res.json(productos);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/productos/qr/:codigo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [productos] = await db.query(`${productoSelect} WHERE p.codigoQR = ?`, [req.params.codigo]);
    res.json(productos[0] || null);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/productos/externo/:codigo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const codigo = texto(req.params.codigo);
  if (!/^\d{8,14}$/.test(codigo)) {
    return res.status(400).json({ message: 'Para buscar información pública ingresa un código EAN o UPC válido' });
  }

  try {
    const fields = 'code,product_name,brands,quantity,categories,image_front_url';
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(codigo)}?fields=${fields}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            process.env.OPEN_FOOD_FACTS_USER_AGENT || 'TiendaInventario/0.0.1 (contacto: administrador local)',
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (response.status === 404) {
      return res.json({ encontrado: false, fuente: 'Open Food Facts', codigoQR: codigo });
    }
    if (!response.ok) {
      return res.status(502).json({ message: 'El proveedor de información no está disponible' });
    }

    const data = await response.json();
    const producto = data.product;
    if (!producto) {
      return res.json({ encontrado: false, fuente: 'Open Food Facts', codigoQR: codigo });
    }

    return res.json({
      encontrado: true,
      fuente: 'Open Food Facts',
      codigoQR: codigo,
      nombre: texto(producto.product_name),
      marca: texto(producto.brands).split(',')[0],
      categoria: texto(producto.categories).split(',')[0],
      tamano: texto(producto.quantity),
      presentacion: texto(producto.quantity),
      imagenUrl: texto(producto.image_front_url),
    });
  } catch (error) {
    console.error('Error al consultar Open Food Facts:', error.message);
    return res.status(502).json({ message: 'No fue posible consultar información pública en este momento' });
  }
});

app.post('/productos', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const errorValidacion = validarProducto(req.body);
  if (errorValidacion) return res.status(400).json({ message: errorValidacion });

  let connection;
  try {
    const errorCatalogos = await validarCatalogosProducto(req.body);
    if (errorCatalogos) return res.status(400).json({ message: errorCatalogos });
    if (await codigoEnUso(req.body.codigoQR)) {
      return res.status(409).json({ message: 'El código de barras ya pertenece a otro producto' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO productos
        (nombrePro, precioVentaPro, costoPro, existenciaPro, stockMinimoPro, tamanoPro, presentacionPro, tipoPro, codigoQR, skuPro, imagenPro, idMarca, idCat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      valoresProducto(req.body),
    );
    const producto = await obtenerProducto(result.insertId, connection);
    if (!producto) throw new Error('No se pudo recuperar el producto creado dentro de la transacción');
    await connection.commit();
    res.status(201).json(producto);
  } catch (error) {
    if (connection) await connection.rollback();
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.post('/productos/:id/imagen', autenticar, autorizarRoles('ADMINISTRADOR'), (req, res) => {
  uploadImagen.single('imagen')(req, res, async (uploadError) => {
    if (uploadError) {
      const mensaje =
        uploadError.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen no puede superar 5 MB'
          : 'Solo se permiten imágenes JPEG, PNG o WEBP';
      return res.status(400).json({ message: mensaje });
    }
    const idPro = idValido(req.params.id);
    if (!idPro) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: 'El ID del producto no es válido' });
    }
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen para subir' });

    try {
      if (!(await obtenerProducto(idPro))) {
        fs.unlink(req.file.path, () => undefined);
        return res.status(404).json({ message: 'Producto no encontrado' });
      }
      const rutaPublica = `/uploads/productos/${req.file.filename}`;
      await db.query('UPDATE productos SET imagenPro = ? WHERE idPro = ?', [rutaPublica, idPro]);
      const producto = await obtenerProducto(idPro);
      if (!producto) throw new Error('No se pudo recuperar el producto después de subir la imagen');
      return res.json(producto);
    } catch (error) {
      fs.unlink(req.file.path, () => undefined);
      return errorServidor(res, error);
    }
  });
});

app.put('/productos/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idPro = idValido(req.params.id);
  if (!idPro) return res.status(400).json({ message: 'El ID del producto no es válido' });
  const errorValidacion = validarProducto(req.body);
  if (errorValidacion) return res.status(400).json({ message: errorValidacion });

  try {
    if (!(await obtenerProducto(idPro))) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    const errorCatalogos = await validarCatalogosProducto(req.body);
    if (errorCatalogos) return res.status(400).json({ message: errorCatalogos });
    if (await codigoEnUso(req.body.codigoQR, idPro)) {
      return res.status(409).json({ message: 'El código de barras ya pertenece a otro producto' });
    }

    await db.query(
      `UPDATE productos SET
        nombrePro = ?, precioVentaPro = ?, costoPro = ?, existenciaPro = ?, stockMinimoPro = ?, tamanoPro = ?,
        presentacionPro = ?, tipoPro = ?, codigoQR = ?, skuPro = ?, imagenPro = ?, idMarca = ?, idCat = ?
       WHERE idPro = ?`,
      [...valoresProducto(req.body), idPro],
    );
    res.json(await obtenerProducto(idPro));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.delete('/productos/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idPro = idValido(req.params.id);
  if (!idPro) return res.status(400).json({ message: 'El ID del producto no es válido' });

  try {
    if (!(await obtenerProducto(idPro))) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    const [[ventas], [compras]] = await Promise.all([
      db.query('SELECT idDetVenta FROM detventa WHERE idPro = ? LIMIT 1', [idPro]),
      db.query('SELECT idDetCompra FROM detcompra WHERE idPro = ? LIMIT 1', [idPro]),
    ]);
    if (ventas.length > 0 || compras.length > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar el producto porque tiene ventas o compras relacionadas',
      });
    }
    await db.query('DELETE FROM productos WHERE idPro = ?', [idPro]);
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/marca', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [marcas] = await db.query('SELECT idMarca, nombreMarca, descripMarca FROM marca ORDER BY nombreMarca');
    res.json(marcas);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/marca', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const nombre = texto(req.body.nombre);
  if (!nombre) return res.status(400).json({ message: 'El nombre de la marca es obligatorio' });
  try {
    const [result] = await db.query('INSERT INTO marca (nombreMarca, descripMarca) VALUES (?, ?)', [
      nombre,
      texto(req.body.descripcion),
    ]);
    const [marcas] = await db.query('SELECT idMarca, nombreMarca, descripMarca FROM marca WHERE idMarca = ?', [
      result.insertId,
    ]);
    res.status(201).json(marcas[0]);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.put('/marca/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idMarca = idValido(req.params.id);
  const nombre = texto(req.body.nombre);
  if (!idMarca) return res.status(400).json({ message: 'El ID de la marca no es válido' });
  if (!nombre) return res.status(400).json({ message: 'El nombre de la marca es obligatorio' });
  try {
    const [result] = await db.query('UPDATE marca SET nombreMarca = ?, descripMarca = ? WHERE idMarca = ?', [
      nombre,
      texto(req.body.descripcion),
      idMarca,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Marca no encontrada' });
    const [marcas] = await db.query('SELECT idMarca, nombreMarca, descripMarca FROM marca WHERE idMarca = ?', [
      idMarca,
    ]);
    res.json(marcas[0]);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.delete('/marca/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idMarca = idValido(req.params.id);
  if (!idMarca) return res.status(400).json({ message: 'El ID de la marca no es válido' });
  try {
    const [marcas] = await db.query('SELECT idMarca FROM marca WHERE idMarca = ?', [idMarca]);
    if (marcas.length === 0) return res.status(404).json({ message: 'Marca no encontrada' });
    const [productos] = await db.query('SELECT idPro FROM productos WHERE idMarca = ? LIMIT 1', [idMarca]);
    if (productos.length > 0) {
      return res.status(409).json({ message: 'No se puede eliminar la marca porque tiene productos asociados' });
    }
    await db.query('DELETE FROM marca WHERE idMarca = ?', [idMarca]);
    res.json({ message: 'Marca eliminada correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/categoria', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [categorias] = await db.query('SELECT idCat, nombreCat, descripCat FROM categoria ORDER BY nombreCat');
    res.json(categorias);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/categoria', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const nombre = texto(req.body.nombre);
  if (!nombre) return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  try {
    const [result] = await db.query('INSERT INTO categoria (nombreCat, descripCat) VALUES (?, ?)', [
      nombre,
      texto(req.body.descripcion),
    ]);
    const [categorias] = await db.query('SELECT idCat, nombreCat, descripCat FROM categoria WHERE idCat = ?', [
      result.insertId,
    ]);
    res.status(201).json(categorias[0]);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.put('/categoria/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idCat = idValido(req.params.id);
  const nombre = texto(req.body.nombre);
  if (!idCat) return res.status(400).json({ message: 'El ID de la categoría no es válido' });
  if (!nombre) return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  try {
    const [result] = await db.query('UPDATE categoria SET nombreCat = ?, descripCat = ? WHERE idCat = ?', [
      nombre,
      texto(req.body.descripcion),
      idCat,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
    const [categorias] = await db.query('SELECT idCat, nombreCat, descripCat FROM categoria WHERE idCat = ?', [idCat]);
    res.json(categorias[0]);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.delete('/categoria/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idCat = idValido(req.params.id);
  if (!idCat) return res.status(400).json({ message: 'El ID de la categoría no es válido' });
  try {
    const [categorias] = await db.query('SELECT idCat FROM categoria WHERE idCat = ?', [idCat]);
    if (categorias.length === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
    const [productos] = await db.query('SELECT idPro FROM productos WHERE idCat = ? LIMIT 1', [idCat]);
    if (productos.length > 0) {
      return res.status(409).json({ message: 'No se puede eliminar la categoría porque tiene productos asociados' });
    }
    await db.query('DELETE FROM categoria WHERE idCat = ?', [idCat]);
    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/sucursal', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [sucursales] = await db.query(`${sucursalSelect} ORDER BY s.nombreSuc, s.idSuc`);
    res.json(sucursales);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/sucursal/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  try {
    const sucursal = await obtenerSucursal(idSuc);
    if (!sucursal) return res.status(404).json({ message: 'Sucursal no encontrada' });
    res.json(sucursal);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/sucursal', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const errorValidacion = validarSucursal(req.body);
  if (errorValidacion) return res.status(400).json({ message: errorValidacion });
  try {
    const [result] = await db.query(
      `INSERT INTO sucursal
        (nombreSuc, descripcionSuc, telefonoSuc, correoSuc, paginaWebSuc, redSocialSuc)
       VALUES (?, ?, ?, ?, ?, ?)`,
      valoresSucursal(req.body),
    );
    res.status(201).json(await obtenerSucursal(result.insertId));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.put('/sucursal/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  const errorValidacion = validarSucursal(req.body);
  if (errorValidacion) return res.status(400).json({ message: errorValidacion });
  try {
    const [result] = await db.query(
      `UPDATE sucursal SET nombreSuc = ?, descripcionSuc = ?, telefonoSuc = ?, correoSuc = ?,
        paginaWebSuc = ?, redSocialSuc = ? WHERE idSuc = ?`,
      [...valoresSucursal(req.body), idSuc],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Sucursal no encontrada' });
    res.json(await obtenerSucursal(idSuc));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/sucursal/:id/logo', autenticar, autorizarRoles('ADMINISTRADOR'), (req, res) => {
  uploadLogo.single('logo')(req, res, async (uploadError) => {
    if (uploadError) {
      const mensaje =
        uploadError.code === 'LIMIT_FILE_SIZE'
          ? 'El logo no puede superar 5 MB'
          : 'Solo se permiten imágenes JPEG, PNG o WEBP';
      return res.status(400).json({ message: mensaje });
    }
    const idSuc = idValido(req.params.id);
    if (!idSuc) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
    }
    if (!req.file) return res.status(400).json({ message: 'Selecciona un logo para subir' });
    try {
      const anterior = await obtenerSucursal(idSuc);
      if (!anterior) {
        fs.unlink(req.file.path, () => undefined);
        return res.status(404).json({ message: 'Sucursal no encontrada' });
      }
      const rutaPublica = `/uploads/tienda/${req.file.filename}`;
      await db.query('UPDATE sucursal SET logoSuc = ? WHERE idSuc = ?', [rutaPublica, idSuc]);
      const sucursal = await obtenerSucursal(idSuc);
      eliminarUploadControlado(anterior.logoSuc, tiendaUploadDir, '/uploads/tienda/');
      res.json(sucursal);
    } catch (error) {
      fs.unlink(req.file.path, () => undefined);
      errorServidor(res, error);
    }
  });
});

app.delete('/sucursal/:id/logo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  try {
    const anterior = await obtenerSucursal(idSuc);
    if (!anterior) return res.status(404).json({ message: 'Sucursal no encontrada' });
    await db.query('UPDATE sucursal SET logoSuc = NULL WHERE idSuc = ?', [idSuc]);
    eliminarUploadControlado(anterior.logoSuc, tiendaUploadDir, '/uploads/tienda/');
    res.json(await obtenerSucursal(idSuc));
  } catch (error) {
    errorServidor(res, error);
  }
});

const rolesPos = autorizarRoles('ADMINISTRADOR', 'CAJERO');

function uuidValido(value) {
  const uuid = texto(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid) ? uuid : null;
}

const HORAS_RESERVA_PEDIDO = 2;
const MAX_TOTAL_PEDIDO_CENTAVOS = 9999999999;

function errorFuncional(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function booleanoEstricto(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

function folioPedido(idPedido) {
  return `PED-${String(idPedido).padStart(6, '0')}`;
}

function normalizarConfiguracionTransferencia(row, incluirAdministrativo = false) {
  if (!row) return null;
  const configuracion = {
    banco: row.banco,
    titular: row.titular,
    clabe: row.clabe,
    numeroCuenta: row.numeroCuenta,
    instrucciones: row.instrucciones,
  };
  return incluirAdministrativo
    ? {
        idConfiguracion: Number(row.idConfiguracion),
        idSuc: Number(row.idSuc),
        ...configuracion,
        activo: Boolean(row.activo),
        fechaActualizacion: row.fechaActualizacion,
      }
    : configuracion;
}

async function obtenerSucursalDisponibleCliente(executor = db) {
  const [sucursales] = await executor.query('SELECT idSuc FROM sucursal ORDER BY idSuc LIMIT 2');
  if (!sucursales.length) throw errorFuncional('No hay una sucursal disponible para recibir pedidos.', 409);
  if (sucursales.length > 1) {
    throw errorFuncional('Selecciona una sucursal antes de continuar con tu pedido.', 409);
  }
  return Number(sucursales[0].idSuc);
}

async function obtenerConfiguracionTransferencia(executor, idSuc, exigirActiva = true) {
  const [rows] = await executor.query('SELECT * FROM configuracion_transferencia WHERE idSuc = ?', [idSuc]);
  const configuracion = rows[0];
  if (!configuracion || (exigirActiva && !configuracion.activo)) {
    throw errorFuncional('Los pagos por transferencia no están disponibles en este momento.', 409);
  }
  return configuracion;
}

function normalizarPedido(row) {
  return {
    idPedido: Number(row.idPedido),
    folio: folioPedido(row.idPedido),
    uuidPedido: row.uuidPedido,
    fechaPedido: row.fechaPedido,
    fechaLimitePago: row.fechaLimitePago,
    estado: row.estado,
    total: Number(row.total),
    tieneComprobante: Boolean(row.comprobanteRuta),
    fechaComprobante: row.fechaComprobante || null,
    motivoRechazo: row.motivoRechazo || null,
    idVenta: row.idVenta === null || row.idVenta === undefined ? null : Number(row.idVenta),
    fechaRevision: row.fechaRevision || null,
  };
}

function configuracionTransferenciaPedido(pedido) {
  const tieneSnapshot = [
    pedido.bancoSnapshot,
    pedido.titularSnapshot,
    pedido.clabeSnapshot,
    pedido.numeroCuentaSnapshot,
    pedido.instruccionesSnapshot,
  ].some((valor) => valor !== null && valor !== undefined);
  if (!tieneSnapshot) return null;
  return {
    banco: pedido.bancoSnapshot,
    titular: pedido.titularSnapshot,
    clabe: pedido.clabeSnapshot,
    numeroCuenta: pedido.numeroCuentaSnapshot,
    instrucciones: pedido.instruccionesSnapshot,
  };
}

async function obtenerPedidoSeguro(executor, idPedido, idCliente) {
  const [pedidos] = await executor.query(
    `
    SELECT idPedido, uuidPedido, idCliente, idSuc, fechaPedido, total, estado, fechaLimitePago,
      comprobanteRuta, comprobanteMime, comprobanteNombre, fechaComprobante,
      idEmpRevisa, fechaRevision, motivoRechazo, idVenta,
      bancoSnapshot, titularSnapshot, clabeSnapshot, numeroCuentaSnapshot, instruccionesSnapshot
    FROM pedido_cliente WHERE idPedido = ? AND idCliente = ?
  `,
    [idPedido, idCliente],
  );
  if (!pedidos.length) return null;
  const pedido = pedidos[0];
  const [items] = await executor.query(
    `
    SELECT d.idPro, COALESCE(p.nombrePro, 'Producto') AS nombre, p.imagenPro,
      p.tamanoPro, p.presentacionPro, d.cantidad, d.precioUnitario, d.subtotal
    FROM detalle_pedido_cliente d
    LEFT JOIN productos p ON p.idPro = d.idPro
    WHERE d.idPedido = ? ORDER BY d.idDetallePedido
  `,
    [idPedido],
  );
  let configuracionTransferencia = configuracionTransferenciaPedido(pedido);
  if (!configuracionTransferencia) {
    try {
      configuracionTransferencia = normalizarConfiguracionTransferencia(
        await obtenerConfiguracionTransferencia(executor, Number(pedido.idSuc), false),
      );
    } catch {
      configuracionTransferencia = null;
    }
  }
  return {
    ...normalizarPedido(pedido),
    items: items.map((item) => ({
      idPro: Number(item.idPro),
      nombre: item.nombre,
      imagen: item.imagenPro,
      presentacion: [item.tamanoPro, item.presentacionPro].filter(Boolean).join(' · ') || null,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precioUnitario),
      subtotal: Number(item.subtotal),
    })),
    configuracionTransferencia,
  };
}

async function restaurarStockPedido(connection, idPedido) {
  const [detalles] = await connection.query(
    'SELECT idPro, cantidad FROM detalle_pedido_cliente WHERE idPedido = ? ORDER BY idPro',
    [idPedido],
  );
  if (!detalles.length) return;
  const ids = detalles.map((detalle) => Number(detalle.idPro));
  await connection.query(
    `SELECT idPro FROM productos WHERE idPro IN (${ids.map(() => '?').join(',')}) ORDER BY idPro FOR UPDATE`,
    ids,
  );
  for (const detalle of detalles) {
    await connection.query('UPDATE productos SET existenciaPro = existenciaPro + ? WHERE idPro = ?', [
      Number(detalle.cantidad),
      Number(detalle.idPro),
    ]);
  }
}

async function expirarPedidoBloqueado(connection, pedido) {
  const vencido =
    pedido.estado === 'PENDIENTE_PAGO' &&
    !pedido.comprobanteRuta &&
    pedido.fechaLimitePago &&
    new Date(pedido.fechaLimitePago).getTime() < Date.now();
  if (!vencido) return false;
  await restaurarStockPedido(connection, Number(pedido.idPedido));
  await connection.query(
    "UPDATE pedido_cliente SET estado = 'EXPIRADO' WHERE idPedido = ? AND estado = 'PENDIENTE_PAGO'",
    [pedido.idPedido],
  );
  return true;
}

async function liberarPedidosExpirados(idCliente = null) {
  const parametros = [];
  let filtro = "estado = 'PENDIENTE_PAGO' AND comprobanteRuta IS NULL AND fechaLimitePago < NOW()";
  if (idCliente) {
    filtro += ' AND idCliente = ?';
    parametros.push(idCliente);
  }
  const [candidatos] = await db.query(
    `SELECT idPedido FROM pedido_cliente WHERE ${filtro} ORDER BY idPedido LIMIT 50`,
    parametros,
  );
  for (const candidato of candidatos) {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM pedido_cliente WHERE idPedido = ? FOR UPDATE', [
        candidato.idPedido,
      ]);
      if (rows.length) await expirarPedidoBloqueado(connection, rows[0]);
      await connection.commit();
    } catch (error) {
      if (connection) await connection.rollback().catch(() => undefined);
      console.error('No se pudo liberar un pedido expirado:', error.message);
    } finally {
      connection?.release();
    }
  }
}

function validarConfiguracionTransferencia(body) {
  const activo = booleanoEstricto(body.activo);
  const banco = texto(body.banco);
  const titular = texto(body.titular);
  const clabe = texto(body.clabe);
  const numeroCuenta = texto(body.numeroCuenta);
  const instrucciones = texto(body.instrucciones);
  if (activo === null) return { error: 'El estado de transferencias no es válido.' };
  if (banco.length > 100) return { error: 'El banco no puede superar 100 caracteres.' };
  if (titular.length > 150) return { error: 'El titular no puede superar 150 caracteres.' };
  if (clabe && !/^\d{18}$/.test(clabe)) return { error: 'La CLABE debe contener exactamente 18 dígitos.' };
  if (numeroCuenta.length > 50) return { error: 'El número de cuenta no puede superar 50 caracteres.' };
  if (instrucciones.length > 1000) return { error: 'Las instrucciones no pueden superar 1000 caracteres.' };
  if (activo && (!banco || !titular)) return { error: 'Banco y titular son obligatorios al habilitar transferencias.' };
  if (activo && !clabe && !numeroCuenta) return { error: 'Configura una CLABE o un número de cuenta.' };
  return {
    valores: {
      banco,
      titular,
      clabe: clabe || null,
      numeroCuenta: numeroCuenta || null,
      instrucciones: instrucciones || null,
      activo,
    },
  };
}

app.get('/configuracion/transferencia', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.empleado.idSuc);
  if (!idSuc) return res.status(409).json({ message: 'El administrador no tiene una sucursal asignada.' });
  try {
    const [rows] = await db.query('SELECT * FROM configuracion_transferencia WHERE idSuc = ?', [idSuc]);
    res.json({ configuracion: normalizarConfiguracionTransferencia(rows[0], true) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.put('/configuracion/transferencia', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.empleado.idSuc);
  if (!idSuc) return res.status(409).json({ message: 'El administrador no tiene una sucursal asignada.' });
  const validacion = validarConfiguracionTransferencia(req.body || {});
  if (validacion.error) return res.status(400).json({ message: validacion.error });
  const datos = validacion.valores;
  try {
    await db.query(
      `INSERT INTO configuracion_transferencia
      (idSuc, banco, titular, clabe, numeroCuenta, instrucciones, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE banco=VALUES(banco), titular=VALUES(titular), clabe=VALUES(clabe),
        numeroCuenta=VALUES(numeroCuenta), instrucciones=VALUES(instrucciones), activo=VALUES(activo)`,
      [idSuc, datos.banco, datos.titular, datos.clabe, datos.numeroCuenta, datos.instrucciones, datos.activo ? 1 : 0],
    );
    const [rows] = await db.query('SELECT * FROM configuracion_transferencia WHERE idSuc = ?', [idSuc]);
    res.json({ configuracion: normalizarConfiguracionTransferencia(rows[0], true) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cliente/configuracion-transferencia', autenticarCliente, async (req, res) => {
  try {
    const idSuc = await obtenerSucursalDisponibleCliente();
    const configuracion = await obtenerConfiguracionTransferencia(db, idSuc, true);
    res.json({ configuracion: normalizarConfiguracionTransferencia(configuracion) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.post('/cliente/pedidos', autenticarCliente, async (req, res) => {
  const uuidPedido = uuidValido(req.body?.uuidPedido);
  if (!uuidPedido) return res.status(400).json({ message: 'uuidPedido no es válido.' });
  if (!Array.isArray(req.body?.items) || !req.body.items.length) {
    return res.status(400).json({ message: 'Agrega al menos un producto al pedido.' });
  }
  const cantidades = new Map();
  for (const item of req.body.items) {
    const idPro = idValido(item?.idPro);
    const cantidad = Number(item?.cantidad);
    if (!idPro || !Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ message: 'Los productos o cantidades no son válidos.' });
    }
    const acumulada = (cantidades.get(idPro) || 0) + cantidad;
    if (!Number.isSafeInteger(acumulada))
      return res.status(400).json({ message: 'La cantidad solicitada no es válida.' });
    cantidades.set(idPro, acumulada);
  }
  const itemsSolicitados = [...cantidades.entries()].sort((a, b) => a[0] - b[0]);
  const idCliente = Number(req.cliente.idCliente);
  await liberarPedidosExpirados();
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [repetidos] = await connection.query(
      'SELECT idPedido, idCliente FROM pedido_cliente WHERE uuidPedido = ? FOR UPDATE',
      [uuidPedido],
    );
    if (repetidos.length) {
      if (Number(repetidos[0].idCliente) !== idCliente)
        throw errorFuncional('El identificador del pedido ya está en uso.', 409);
      const existente = await obtenerPedidoSeguro(connection, Number(repetidos[0].idPedido), idCliente);
      await connection.commit();
      return res.json(existente);
    }
    const idSuc = await obtenerSucursalDisponibleCliente(connection);
    const configuracion = await obtenerConfiguracionTransferencia(connection, idSuc, true);
    const ids = itemsSolicitados.map(([idPro]) => idPro);
    const [productos] = await connection.query(
      `
      SELECT idPro, nombrePro, precioVentaPro, existenciaPro, activoPro
      FROM productos WHERE idPro IN (${ids.map(() => '?').join(',')}) ORDER BY idPro FOR UPDATE
    `,
      ids,
    );
    if (productos.length !== ids.length) throw errorFuncional('Uno de los productos ya no está disponible.', 409);
    const porId = new Map(productos.map((producto) => [Number(producto.idPro), producto]));
    const detalles = [];
    let totalCentavos = 0;
    for (const [idPro, cantidad] of itemsSolicitados) {
      const producto = porId.get(idPro);
      if (!producto || !producto.activoPro)
        throw errorFuncional(`${producto?.nombrePro || 'Un producto'} ya no está disponible.`, 409);
      if (!Number.isInteger(Number(producto.existenciaPro)) || Number(producto.existenciaPro) < cantidad) {
        throw errorFuncional(`Stock insuficiente para ${producto.nombrePro}.`, 409);
      }
      const precioCentavos = dineroCentavos(producto.precioVentaPro);
      if (precioCentavos === null || precioCentavos < 0)
        throw errorFuncional(`El precio de ${producto.nombrePro} no es válido.`, 409);
      const subtotalCentavos = precioCentavos * cantidad;
      if (!Number.isSafeInteger(subtotalCentavos))
        throw errorFuncional('El total solicitado supera el límite permitido.', 400);
      totalCentavos += subtotalCentavos;
      if (!Number.isSafeInteger(totalCentavos) || totalCentavos > MAX_TOTAL_PEDIDO_CENTAVOS) {
        throw errorFuncional('El total solicitado supera el límite permitido.', 400);
      }
      detalles.push({ idPro, cantidad, precioCentavos, subtotalCentavos });
    }
    const [resultado] = await connection.query(
      `INSERT INTO pedido_cliente
      (uuidPedido, idCliente, idSuc, fechaPedido, total, estado, fechaLimitePago,
       bancoSnapshot, titularSnapshot, clabeSnapshot, numeroCuentaSnapshot, instruccionesSnapshot)
      VALUES (?, ?, ?, NOW(), ?, 'PENDIENTE_PAGO', DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?, ?, ?, ?)`,
      [
        uuidPedido,
        idCliente,
        idSuc,
        totalCentavos / 100,
        HORAS_RESERVA_PEDIDO,
        configuracion.banco,
        configuracion.titular,
        configuracion.clabe,
        configuracion.numeroCuenta,
        configuracion.instrucciones,
      ],
    );
    for (const detalle of detalles) {
      await connection.query(
        `INSERT INTO detalle_pedido_cliente
        (idPedido, idPro, cantidad, precioUnitario, subtotal) VALUES (?, ?, ?, ?, ?)`,
        [
          resultado.insertId,
          detalle.idPro,
          detalle.cantidad,
          detalle.precioCentavos / 100,
          detalle.subtotalCentavos / 100,
        ],
      );
      await connection.query('UPDATE productos SET existenciaPro = existenciaPro - ? WHERE idPro = ?', [
        detalle.cantidad,
        detalle.idPro,
      ]);
    }
    const pedido = await obtenerPedidoSeguro(connection, Number(resultado.insertId), idCliente);
    await connection.commit();
    return res.status(201).json(pedido);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.code === 'ER_DUP_ENTRY') {
      try {
        const [rows] = await db.query('SELECT idPedido, idCliente FROM pedido_cliente WHERE uuidPedido = ?', [
          uuidPedido,
        ]);
        if (rows.length && Number(rows[0].idCliente) === idCliente)
          return res.json(await obtenerPedidoSeguro(db, Number(rows[0].idPedido), idCliente));
        return res.status(409).json({ message: 'El identificador del pedido ya está en uso.' });
      } catch (consultaError) {
        return errorServidor(res, consultaError);
      }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    return errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.get('/cliente/pedidos', autenticarCliente, async (req, res) => {
  const idCliente = Number(req.cliente.idCliente);
  try {
    await liberarPedidosExpirados(idCliente);
    const [rows] = await db.query(
      `SELECT idPedido, uuidPedido, fechaPedido, total, estado, fechaLimitePago,
      comprobanteRuta, fechaComprobante FROM pedido_cliente WHERE idCliente = ?
      ORDER BY fechaPedido DESC, idPedido DESC`,
      [idCliente],
    );
    res.json(rows.map(normalizarPedido));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cliente/pedidos/:id', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    await liberarPedidosExpirados(Number(req.cliente.idCliente));
    const pedido = await obtenerPedidoSeguro(db, idPedido, Number(req.cliente.idCliente));
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado.' });
    res.json(pedido);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/cliente/pedidos/:id/cancelar', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT * FROM pedido_cliente WHERE idPedido = ? AND idCliente = ? FOR UPDATE',
      [idPedido, req.cliente.idCliente],
    );
    if (!rows.length) throw errorFuncional('Pedido no encontrado.', 404);
    const pedido = rows[0];
    if (await expirarPedidoBloqueado(connection, pedido)) {
      await connection.commit();
      return res.status(409).json({ message: 'Tu reserva expiró y los productos volvieron al inventario.' });
    }
    if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
      throw errorFuncional(`El pedido ya no puede cancelarse porque está ${pedido.estado}.`, 409);
    }
    await restaurarStockPedido(connection, idPedido);
    await connection.query(
      "UPDATE pedido_cliente SET estado = 'CANCELADO' WHERE idPedido = ? AND estado = 'PENDIENTE_PAGO'",
      [idPedido],
    );
    const actualizado = await obtenerPedidoSeguro(connection, idPedido, Number(req.cliente.idCliente));
    await connection.commit();
    res.json(actualizado);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

function eliminarComprobanteTemporal(archivo) {
  if (!archivo?.path || path.dirname(archivo.path) !== comprobantesUploadDir) return;
  fs.unlink(archivo.path, () => undefined);
}

function mimeRealComprobante(rutaArchivo) {
  const descriptor = fs.openSync(rutaArchivo, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const leidos = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (leidos >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (leidos >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      return 'image/png';
    if (leidos >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')
      return 'image/webp';
    if (leidos >= 5 && buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

function resolverComprobantePrivado(nombreFisico) {
  if (!nombreFisico || path.basename(nombreFisico) !== nombreFisico) return null;
  const raiz = path.resolve(comprobantesUploadDir);
  const ruta = path.resolve(raiz, nombreFisico);
  const relativa = path.relative(raiz, ruta);
  if (!relativa || relativa.startsWith('..') || path.isAbsolute(relativa) || !fs.existsSync(ruta)) return null;
  return ruta;
}

app.post('/cliente/pedidos/:id/comprobante', autenticarCliente, (req, res) => {
  uploadComprobante.single('comprobante')(req, res, async (uploadError) => {
    if (uploadError) {
      const message =
        uploadError.code === 'LIMIT_FILE_SIZE'
          ? 'El comprobante no puede superar 5 MB.'
          : 'Selecciona una imagen JPG, PNG, WEBP o un PDF de máximo 5 MB.';
      return res.status(400).json({ message });
    }
    const idPedido = idValido(req.params.id);
    if (!idPedido || !req.file) {
      eliminarComprobanteTemporal(req.file);
      return res.status(400).json({ message: !idPedido ? 'El pedido no es válido.' : 'Selecciona un comprobante.' });
    }
    if (mimeRealComprobante(req.file.path) !== req.file.mimetype) {
      eliminarComprobanteTemporal(req.file);
      return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG, WEBP o un PDF de máximo 5 MB.' });
    }
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT * FROM pedido_cliente WHERE idPedido = ? AND idCliente = ? FOR UPDATE',
        [idPedido, req.cliente.idCliente],
      );
      if (!rows.length) throw errorFuncional('Pedido no encontrado.', 404);
      const pedido = rows[0];
      if (await expirarPedidoBloqueado(connection, pedido)) {
        await connection.commit();
        eliminarComprobanteTemporal(req.file);
        return res.status(409).json({ message: 'Tu reserva expiró y los productos volvieron al inventario.' });
      }
      if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
        throw errorFuncional('Este pedido ya no acepta comprobantes.', 409);
      }
      await connection.query(
        `UPDATE pedido_cliente SET comprobanteRuta=?, comprobanteMime=?, comprobanteNombre=?,
        fechaComprobante=NOW(), estado='EN_REVISION' WHERE idPedido=? AND idCliente=? AND estado='PENDIENTE_PAGO'`,
        [
          req.file.filename,
          req.file.mimetype,
          texto(req.file.originalname).slice(0, 255) || 'comprobante',
          idPedido,
          req.cliente.idCliente,
        ],
      );
      const actualizado = await obtenerPedidoSeguro(connection, idPedido, Number(req.cliente.idCliente));
      await connection.commit();
      res.json(actualizado);
    } catch (error) {
      if (connection) await connection.rollback().catch(() => undefined);
      eliminarComprobanteTemporal(req.file);
      if (error.status) return res.status(error.status).json({ message: error.message });
      errorServidor(res, error);
    } finally {
      connection?.release();
    }
  });
});

app.get('/cliente/pedidos/:id/comprobante', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    const [rows] = await db.query(
      `SELECT comprobanteRuta, comprobanteMime, comprobanteNombre
      FROM pedido_cliente WHERE idPedido = ? AND idCliente = ? AND comprobanteRuta IS NOT NULL`,
      [idPedido, req.cliente.idCliente],
    );
    if (!rows.length) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    const rutaFisica = resolverComprobantePrivado(rows[0].comprobanteRuta);
    if (!rutaFisica) {
      return res.status(404).json({ message: 'Comprobante no encontrado.' });
    }
    res.type(rows[0].comprobanteMime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(rows[0].comprobanteNombre || 'comprobante')}`,
    );
    res.sendFile(rutaFisica);
  } catch (error) {
    errorServidor(res, error);
  }
});

function normalizarPedidoAdmin(row) {
  return {
    idPedido: Number(row.idPedido),
    folio: folioPedido(row.idPedido),
    uuidPedido: row.uuidPedido,
    fechaPedido: row.fechaPedido,
    fechaLimitePago: row.fechaLimitePago || null,
    total: Number(row.total),
    estado: row.estado,
    fechaComprobante: row.fechaComprobante || null,
    comprobante: row.comprobanteRuta
      ? {
          nombre: row.comprobanteNombre || 'comprobante',
          mime: row.comprobanteMime || 'application/octet-stream',
          fecha: row.fechaComprobante || null,
        }
      : null,
    fechaRevision: row.fechaRevision || null,
    motivoRechazo: row.motivoRechazo || null,
    idVenta: row.idVenta === null || row.idVenta === undefined ? null : Number(row.idVenta),
    cliente: {
      idCliente: Number(row.idCliente),
      nombre: [row.nombreCliente, row.apellidoPatCliente, row.apellidoMatCliente].filter(Boolean).join(' '),
      correo: row.correoCliente,
      foto: row.fotoPerfil || null,
    },
  };
}

const pedidoAdminSelect = `
  SELECT pc.idPedido, pc.uuidPedido, pc.idCliente, pc.idSuc, pc.fechaPedido, pc.total, pc.estado,
    pc.fechaLimitePago, pc.comprobanteRuta, pc.comprobanteMime, pc.comprobanteNombre,
    pc.fechaComprobante, pc.idEmpRevisa, pc.fechaRevision, pc.motivoRechazo, pc.idVenta,
    pc.bancoSnapshot, pc.titularSnapshot, pc.clabeSnapshot, pc.numeroCuentaSnapshot,
    pc.instruccionesSnapshot, c.nombreCliente, c.apellidoPatCliente, c.apellidoMatCliente,
    c.correoCliente, c.fotoPerfil,
    TRIM(CONCAT_WS(' ', e.nombreEmp, e.apellidoPatEmp, e.apellidoMatEmp)) AS empleadoRevisa
  FROM pedido_cliente pc
  INNER JOIN cliente c ON c.idCliente = pc.idCliente
  LEFT JOIN empleados e ON e.idEmp = pc.idEmpRevisa
`;

async function obtenerPedidoAdmin(executor, idPedido, idSuc) {
  const [rows] = await executor.query(`${pedidoAdminSelect} WHERE pc.idPedido = ? AND pc.idSuc = ?`, [idPedido, idSuc]);
  if (!rows.length) return null;
  const row = rows[0];
  const [items] = await executor.query(
    `
    SELECT d.idPro, COALESCE(p.nombrePro, 'Producto') AS nombre, p.imagenPro AS imagen,
      p.tamanoPro, p.presentacionPro, d.cantidad, d.precioUnitario, d.subtotal
    FROM detalle_pedido_cliente d LEFT JOIN productos p ON p.idPro = d.idPro
    WHERE d.idPedido = ? ORDER BY d.idDetallePedido`,
    [idPedido],
  );
  let configuracionTransferencia = configuracionTransferenciaPedido(row);
  if (!configuracionTransferencia) {
    try {
      configuracionTransferencia = normalizarConfiguracionTransferencia(
        await obtenerConfiguracionTransferencia(executor, Number(row.idSuc), false),
      );
    } catch {
      configuracionTransferencia = null;
    }
  }
  return {
    ...normalizarPedidoAdmin(row),
    empleadoRevisa: row.empleadoRevisa || null,
    configuracionTransferencia,
    items: items.map((item) => ({
      idPro: Number(item.idPro),
      nombre: item.nombre,
      imagen: item.imagen,
      presentacion: [item.tamanoPro, item.presentacionPro].filter(Boolean).join(' · ') || null,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precioUnitario),
      subtotal: Number(item.subtotal),
    })),
  };
}

const soloAdministrador = autorizarRoles('ADMINISTRADOR');

app.get('/admin/pedidos', autenticar, soloAdministrador, async (req, res) => {
  const idSuc = idValido(req.empleado.idSuc);
  if (!idSuc) return res.status(409).json({ message: 'El administrador no tiene una sucursal asignada.' });
  try {
    await liberarPedidosExpirados();
    const [rows] = await db.query(
      `${pedidoAdminSelect}
      WHERE pc.idSuc = ? ORDER BY pc.fechaPedido DESC, pc.idPedido DESC`,
      [idSuc],
    );
    res.json(rows.map(normalizarPedidoAdmin));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/admin/pedidos/:id', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    const pedido = await obtenerPedidoAdmin(db, idPedido, Number(req.empleado.idSuc));
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado.' });
    res.json(pedido);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/admin/pedidos/:id/comprobante', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    const [rows] = await db.query(
      `SELECT comprobanteRuta, comprobanteMime, comprobanteNombre
      FROM pedido_cliente WHERE idPedido = ? AND idSuc = ? AND comprobanteRuta IS NOT NULL`,
      [idPedido, req.empleado.idSuc],
    );
    if (!rows.length) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    const rutaFisica = resolverComprobantePrivado(rows[0].comprobanteRuta);
    if (!rutaFisica) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    res.type(rows[0].comprobanteMime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(rows[0].comprobanteNombre || 'comprobante')}`,
    );
    res.sendFile(rutaFisica);
  } catch (error) {
    errorServidor(res, error);
  }
});

async function bloquearPedidoAdmin(connection, idPedido, idSuc) {
  const [rows] = await connection.query('SELECT * FROM pedido_cliente WHERE idPedido = ? AND idSuc = ? FOR UPDATE', [
    idPedido,
    idSuc,
  ]);
  if (!rows.length) throw errorFuncional('Pedido no encontrado.', 404);
  return rows[0];
}

app.post('/admin/pedidos/:id/rechazar', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  const motivo = texto(req.body?.motivo);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  if (motivo.length < 3 || motivo.length > 255)
    return res.status(400).json({ message: 'El motivo debe tener entre 3 y 255 caracteres.' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const pedido = await bloquearPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    if (pedido.estado !== 'EN_REVISION')
      throw errorFuncional('Sólo pueden rechazarse pedidos con pago en revisión.', 409);
    await restaurarStockPedido(connection, idPedido);
    await connection.query(
      `UPDATE pedido_cliente SET estado='RECHAZADO', idEmpRevisa=?,
      fechaRevision=NOW(), motivoRechazo=? WHERE idPedido=? AND estado='EN_REVISION'`,
      [req.empleado.idEmp, motivo, idPedido],
    );
    const actualizado = await obtenerPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    await connection.commit();
    res.json(actualizado);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.post('/admin/pedidos/:id/aprobar', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const pedido = await bloquearPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    if (pedido.estado === 'PAGADO' && pedido.idVenta) throw errorFuncional('El pedido ya fue aprobado.', 409);
    if (pedido.estado !== 'EN_REVISION')
      throw errorFuncional('Sólo pueden aprobarse pedidos con pago en revisión.', 409);
    if (!pedido.comprobanteRuta || !pedido.fechaComprobante)
      throw errorFuncional('El pedido no tiene un comprobante válido para revisar.', 409);
    if (!resolverComprobantePrivado(pedido.comprobanteRuta)) {
      throw errorFuncional('El archivo del comprobante no está disponible.', 409);
    }
    const [detalles] = await connection.query(
      `SELECT idPro, cantidad, precioUnitario, subtotal
      FROM detalle_pedido_cliente WHERE idPedido = ? ORDER BY idPro`,
      [idPedido],
    );
    if (!detalles.length) throw errorFuncional('El pedido no contiene productos.', 409);
    let sumaCentavos = 0;
    for (const detalle of detalles) {
      const cantidad = Number(detalle.cantidad);
      const precioCentavos = dineroCentavos(detalle.precioUnitario);
      const subtotalCentavos = dineroCentavos(detalle.subtotal);
      if (
        !Number.isInteger(cantidad) ||
        cantidad <= 0 ||
        precioCentavos === null ||
        precioCentavos < 0 ||
        subtotalCentavos === null ||
        subtotalCentavos !== precioCentavos * cantidad
      ) {
        throw errorFuncional('Los importes históricos del pedido no son coherentes.', 409);
      }
      sumaCentavos += subtotalCentavos;
      if (!Number.isSafeInteger(sumaCentavos)) throw errorFuncional('El total del pedido no es válido.', 409);
    }
    const totalPedidoCentavos = dineroCentavos(pedido.total);
    if (totalPedidoCentavos === null || sumaCentavos !== totalPedidoCentavos)
      throw errorFuncional('El total del pedido no coincide con sus productos.', 409);
    const [venta] = await connection.query(
      `INSERT INTO venta
      (uuidVenta, fechaVenta, horaVenta, total, metodoPago, montoRecibido, cambio, estadoVenta, idEmp, idSuc, idSesionCaja)
      VALUES (?, CURDATE(), CURTIME(), ?, 'TRANSFERENCIA', NULL, 0.00, 'COMPLETADA', ?, ?, NULL)`,
      [crypto.randomUUID(), totalPedidoCentavos / 100, req.empleado.idEmp, pedido.idSuc],
    );
    for (const detalle of detalles) {
      await connection.query(
        `INSERT INTO detventa
        (idVenta, idPro, cantidadDetVenta, precioUnitarioDetVenta, subtotalDetVenta) VALUES (?, ?, ?, ?, ?)`,
        [venta.insertId, detalle.idPro, detalle.cantidad, detalle.precioUnitario, detalle.subtotal],
      );
    }
    await connection.query(
      `UPDATE pedido_cliente SET estado='PAGADO', idEmpRevisa=?, fechaRevision=NOW(),
      motivoRechazo=NULL, idVenta=? WHERE idPedido=? AND estado='EN_REVISION'`,
      [req.empleado.idEmp, venta.insertId, idPedido],
    );
    const actualizado = await obtenerPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    await connection.commit();
    res.json(actualizado);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

async function cambiarEstadoOperativoPedido(req, res, estadoActual, estadoNuevo) {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const pedido = await bloquearPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    if (pedido.estado !== estadoActual)
      throw errorFuncional(`El pedido debe estar en estado ${estadoActual} para continuar.`, 409);
    await connection.query('UPDATE pedido_cliente SET estado=? WHERE idPedido=? AND estado=?', [
      estadoNuevo,
      idPedido,
      estadoActual,
    ]);
    const actualizado = await obtenerPedidoAdmin(connection, idPedido, Number(req.empleado.idSuc));
    await connection.commit();
    res.json(actualizado);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
}

app.post('/admin/pedidos/:id/listo', autenticar, soloAdministrador, (req, res) =>
  cambiarEstadoOperativoPedido(req, res, 'PAGADO', 'LISTO'),
);
app.post('/admin/pedidos/:id/entregar', autenticar, soloAdministrador, (req, res) =>
  cambiarEstadoOperativoPedido(req, res, 'LISTO', 'ENTREGADO'),
);

const sesionCajaSelect = `
  SELECT sc.*, TRIM(CONCAT_WS(' ', e.nombreEmp, e.apellidoPatEmp, e.apellidoMatEmp)) AS empleado,
    s.nombreSuc
  FROM sesion_caja sc
  LEFT JOIN empleados e ON e.idEmp = sc.idEmp
  LEFT JOIN sucursal s ON s.idSuc = sc.idSuc
`;

function normalizarCaja(row) {
  if (!row) return null;
  const campos = [
    'fondoInicial',
    'totalVentas',
    'totalEfectivo',
    'totalTarjeta',
    'totalTransferencia',
    'totalIngresos',
    'totalRetiros',
    'efectivoEsperado',
    'efectivoContado',
    'diferencia',
  ];
  const caja = { ...row };
  for (const campo of campos) caja[campo] = caja[campo] === null ? null : Number(caja[campo]);
  caja.numeroVentas = Number(caja.numeroVentas) || 0;
  return caja;
}

async function obtenerCajaActual(executor, idEmp, bloquear = false) {
  const [rows] = await executor.query(
    `${sesionCajaSelect} WHERE sc.idEmp = ? AND sc.estado = 'ABIERTA' ORDER BY sc.idSesionCaja DESC LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [idEmp],
  );
  return normalizarCaja(rows[0]);
}

async function calcularResumenCaja(executor, caja) {
  const [ventas] = await executor.query(
    `
    SELECT COALESCE(SUM(total),0) AS totalVentas,
      COALESCE(SUM(CASE WHEN metodoPago='EFECTIVO' THEN total ELSE 0 END),0) AS totalEfectivo,
      COALESCE(SUM(CASE WHEN metodoPago='TARJETA' THEN total ELSE 0 END),0) AS totalTarjeta,
      COALESCE(SUM(CASE WHEN metodoPago='TRANSFERENCIA' THEN total ELSE 0 END),0) AS totalTransferencia,
      COUNT(*) AS numeroVentas
    FROM venta WHERE idSesionCaja = ? AND estadoVenta = 'COMPLETADA'
  `,
    [caja.idSesionCaja],
  );
  const [movimientos] = await executor.query(
    `
    SELECT COALESCE(SUM(CASE WHEN tipoMovimiento='INGRESO' THEN monto ELSE 0 END),0) AS totalIngresos,
      COALESCE(SUM(CASE WHEN tipoMovimiento='RETIRO' THEN monto ELSE 0 END),0) AS totalRetiros
    FROM movimiento_caja WHERE idSesionCaja = ?
  `,
    [caja.idSesionCaja],
  );
  const resumen = {
    ...caja,
    totalVentas: Number(ventas[0].totalVentas),
    totalEfectivo: Number(ventas[0].totalEfectivo),
    totalTarjeta: Number(ventas[0].totalTarjeta),
    totalTransferencia: Number(ventas[0].totalTransferencia),
    numeroVentas: Number(ventas[0].numeroVentas),
    totalIngresos: Number(movimientos[0].totalIngresos),
    totalRetiros: Number(movimientos[0].totalRetiros),
  };
  resumen.efectivoEsperado =
    Number(caja.fondoInicial) + resumen.totalEfectivo + resumen.totalIngresos - resumen.totalRetiros;
  return resumen;
}

app.post('/caja/abrir', autenticar, rolesPos, async (req, res) => {
  const uuid = uuidValido(req.body.uuidSesionCaja);
  const fondo = dineroCentavos(req.body.fondoInicial);
  if (!uuid) return res.status(400).json({ message: 'uuidSesionCaja no es válido' });
  if (fondo === null || fondo < 0) return res.status(400).json({ message: 'El fondo inicial no es válido' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query('SELECT idEmp FROM empleados WHERE idEmp = ? FOR UPDATE', [req.empleado.idEmp]);
    const [repetidas] = await connection.query(`${sesionCajaSelect} WHERE sc.uuidSesionCaja = ?`, [uuid]);
    if (repetidas.length) {
      if (
        Number(repetidas[0].idEmp) !== Number(req.empleado.idEmp) ||
        Number(repetidas[0].idSuc) !== Number(req.empleado.idSuc)
      ) {
        const error = new Error('El identificador de caja ya está en uso.');
        error.status = 409;
        throw error;
      }
      await connection.commit();
      return res.json(normalizarCaja(repetidas[0]));
    }
    if (await obtenerCajaActual(connection, req.empleado.idEmp, true)) {
      const error = new Error('Ya tienes una caja abierta.');
      error.status = 409;
      throw error;
    }
    const [result] = await connection.query(
      `INSERT INTO sesion_caja
      (uuidSesionCaja,idEmp,idSuc,fechaHoraApertura,fondoInicial,estado)
      VALUES (?,?,?,NOW(),?,'ABIERTA')`,
      [uuid, req.empleado.idEmp, req.empleado.idSuc, fondo / 100],
    );
    const [rows] = await connection.query(`${sesionCajaSelect} WHERE sc.idSesionCaja = ?`, [result.insertId]);
    await connection.commit();
    res.status(201).json(normalizarCaja(rows[0]));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.get('/caja/actual', autenticar, rolesPos, async (req, res) => {
  try {
    res.json({ caja: await obtenerCajaActual(db, req.empleado.idEmp) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/caja/actual/resumen', autenticar, rolesPos, async (req, res) => {
  try {
    const caja = await obtenerCajaActual(db, req.empleado.idEmp);
    if (!caja) return res.status(404).json({ message: 'No tienes una caja abierta.' });
    res.json(await calcularResumenCaja(db, caja));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/caja/movimientos', autenticar, rolesPos, async (req, res) => {
  const uuid = uuidValido(req.body.uuidMovimientoCaja),
    tipo = texto(req.body.tipoMovimiento).toUpperCase(),
    concepto = texto(req.body.concepto),
    monto = dineroCentavos(req.body.monto);
  if (!uuid) return res.status(400).json({ message: 'uuidMovimientoCaja no es válido' });
  if (!['INGRESO', 'RETIRO'].includes(tipo))
    return res.status(400).json({ message: 'El tipo de movimiento no es válido' });
  if (monto === null || monto <= 0) return res.status(400).json({ message: 'El monto debe ser mayor que cero' });
  if (!concepto || concepto.length > 255)
    return res.status(400).json({ message: 'El concepto es obligatorio y admite hasta 255 caracteres' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const caja = await obtenerCajaActual(connection, req.empleado.idEmp, true);
    if (!caja) {
      const e = new Error('No tienes una caja abierta.');
      e.status = 409;
      throw e;
    }
    const [existentes] = await connection.query('SELECT * FROM movimiento_caja WHERE uuidMovimientoCaja=?', [uuid]);
    if (existentes.length) {
      if (
        Number(existentes[0].idSesionCaja) !== Number(caja.idSesionCaja) ||
        Number(existentes[0].idEmp) !== Number(req.empleado.idEmp)
      ) {
        const e = new Error('El identificador del movimiento ya está en uso.');
        e.status = 409;
        throw e;
      }
      await connection.commit();
      return res.json({ ...existentes[0], monto: Number(existentes[0].monto) });
    }
    const [result] = await connection.query(
      `INSERT INTO movimiento_caja(uuidMovimientoCaja,idSesionCaja,idEmp,tipoMovimiento,monto,concepto,fechaHora) VALUES(?,?,?,?,?,?,NOW())`,
      [uuid, caja.idSesionCaja, req.empleado.idEmp, tipo, monto / 100, concepto],
    );
    const [rows] = await connection.query('SELECT * FROM movimiento_caja WHERE idMovimientoCaja=?', [result.insertId]);
    await connection.commit();
    res.status(201).json({ ...rows[0], monto: Number(rows[0].monto) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.get('/caja/movimientos', autenticar, rolesPos, async (req, res) => {
  try {
    const caja = await obtenerCajaActual(db, req.empleado.idEmp);
    if (!caja) return res.status(404).json({ message: 'No tienes una caja abierta.' });
    const [rows] = await db.query(
      'SELECT * FROM movimiento_caja WHERE idSesionCaja=? ORDER BY fechaHora DESC,idMovimientoCaja DESC',
      [caja.idSesionCaja],
    );
    res.json(rows.map((r) => ({ ...r, monto: Number(r.monto) })));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/caja/cerrar', autenticar, rolesPos, async (req, res) => {
  const contado = dineroCentavos(req.body.efectivoContado),
    observaciones = texto(req.body.observaciones);
  if (contado === null || contado < 0) return res.status(400).json({ message: 'El efectivo contado no es válido' });
  if (observaciones.length > 1000) return res.status(400).json({ message: 'Las observaciones son demasiado largas' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const caja = await obtenerCajaActual(connection, req.empleado.idEmp, true);
    if (!caja) {
      const e = new Error('No tienes una caja abierta.');
      e.status = 409;
      throw e;
    }
    const resumen = await calcularResumenCaja(connection, caja);
    const diferencia = contado / 100 - resumen.efectivoEsperado;
    await connection.query(
      `UPDATE sesion_caja SET fechaHoraCierre=NOW(),totalVentas=?,totalEfectivo=?,totalTarjeta=?,totalTransferencia=?,totalIngresos=?,totalRetiros=?,efectivoEsperado=?,efectivoContado=?,diferencia=?,numeroVentas=?,estado='CERRADA',observaciones=? WHERE idSesionCaja=? AND estado='ABIERTA'`,
      [
        resumen.totalVentas,
        resumen.totalEfectivo,
        resumen.totalTarjeta,
        resumen.totalTransferencia,
        resumen.totalIngresos,
        resumen.totalRetiros,
        resumen.efectivoEsperado,
        contado / 100,
        diferencia,
        resumen.numeroVentas,
        observaciones || null,
        caja.idSesionCaja,
      ],
    );
    const [rows] = await connection.query(`${sesionCajaSelect} WHERE sc.idSesionCaja=?`, [caja.idSesionCaja]);
    await connection.commit();
    res.json(normalizarCaja(rows[0]));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.get('/caja/historial', autenticar, rolesPos, async (req, res) => {
  const filtros = [],
    valores = [];
  if (req.empleado.cargo === 'CAJERO') {
    filtros.push('sc.idEmp=?');
    valores.push(req.empleado.idEmp);
  } else {
    filtros.push('sc.idSuc=?');
    valores.push(req.empleado.idSuc);
    if (idValido(req.query.idEmp)) {
      filtros.push('sc.idEmp=?');
      valores.push(idValido(req.query.idEmp));
    }
  }
  if (['ABIERTA', 'CERRADA'].includes(texto(req.query.estado).toUpperCase())) {
    filtros.push('sc.estado=?');
    valores.push(texto(req.query.estado).toUpperCase());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto(req.query.fecha))) {
    filtros.push('DATE(sc.fechaHoraApertura)=?');
    valores.push(texto(req.query.fecha));
  }
  try {
    const [rows] = await db.query(
      `${sesionCajaSelect} WHERE ${filtros.join(' AND ')} ORDER BY sc.fechaHoraApertura DESC`,
      valores,
    );
    res.json(rows.map(normalizarCaja));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/caja/:id', autenticar, rolesPos, async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ message: 'El folio de caja no es válido' });
  const filtro = req.empleado.cargo === 'CAJERO' ? 'sc.idEmp=?' : 'sc.idSuc=?',
    valor = req.empleado.cargo === 'CAJERO' ? req.empleado.idEmp : req.empleado.idSuc;
  try {
    const [rows] = await db.query(`${sesionCajaSelect} WHERE sc.idSesionCaja=? AND ${filtro}`, [id, valor]);
    if (!rows.length) return res.status(404).json({ message: 'Corte no encontrado' });
    res.json(normalizarCaja(rows[0]));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/pos/productos', autenticar, rolesPos, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.idPro, p.nombrePro, p.precioVentaPro, p.existenciaPro, p.codigoQR,
        p.skuPro, p.imagenPro, p.tamanoPro, p.presentacionPro,
        m.nombreMarca, c.nombreCat
      FROM productos p
      LEFT JOIN marca m ON m.idMarca = p.idMarca
      LEFT JOIN categoria c ON c.idCat = p.idCat
      WHERE p.activoPro = 1
      ORDER BY p.nombrePro, p.idPro
    `);
    res.json(
      rows.map((row) => ({
        ...row,
        precioVentaPro: Number(row.precioVentaPro),
        existenciaPro: Number(row.existenciaPro) || 0,
      })),
    );
  } catch (error) {
    errorServidor(res, error);
  }
});

function dineroCentavos(value) {
  const numero = Number(value);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

async function obtenerVentaRegistrada(executor, idVenta, empleado) {
  const [ventas] = await executor.query(
    `SELECT idVenta,uuidVenta,idSesionCaja,DATE_FORMAT(fechaVenta,'%Y-%m-%d') fechaVenta,TIME_FORMAT(horaVenta,'%H:%i:%s') horaVenta,total,metodoPago,montoRecibido,cambio,estadoVenta,idEmp,idSuc FROM venta WHERE idVenta=?`,
    [idVenta],
  );
  if (!ventas.length) return null;
  const [items] = await executor.query(
    `SELECT d.idPro,COALESCE(p.nombrePro,'Producto') nombre,d.cantidadDetVenta cantidad,d.precioUnitarioDetVenta precioUnitario,d.subtotalDetVenta subtotal FROM detventa d LEFT JOIN productos p ON p.idPro=d.idPro WHERE d.idVenta=? ORDER BY d.idDetVenta`,
    [idVenta],
  );
  const venta = ventas[0];
  return {
    ...venta,
    total: Number(venta.total),
    montoRecibido: venta.montoRecibido === null ? null : Number(venta.montoRecibido),
    cambio: Number(venta.cambio),
    cajero: { idEmp: Number(venta.idEmp), nombre: empleadoSeguro(empleado).nombre },
    items: items.map((i) => ({
      ...i,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precioUnitario),
      subtotal: Number(i.subtotal),
    })),
  };
}

app.post('/ventas', autenticar, rolesPos, async (req, res) => {
  const uuidVenta = uuidValido(req.body.uuidVenta);
  if (!uuidVenta) return res.status(400).json({ message: 'uuidVenta no es válido' });
  const metodoPago = texto(req.body.metodoPago).toUpperCase();
  const metodosValidos = new Set(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);
  if (!metodosValidos.has(metodoPago)) return res.status(400).json({ message: 'El método de pago no es válido' });
  if (!Array.isArray(req.body.items) || !req.body.items.length)
    return res.status(400).json({ message: 'La venta no contiene productos' });

  const cantidades = new Map();
  for (const item of req.body.items) {
    const idPro = idValido(item?.idPro);
    const cantidad = Number(item?.cantidad);
    if (!idPro || !Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ message: 'Los productos o cantidades no son válidos' });
    }
    cantidades.set(idPro, (cantidades.get(idPro) || 0) + cantidad);
  }

  const ids = [...cantidades.keys()].sort((a, b) => a - b);
  const montoRecibidoCentavos = metodoPago === 'EFECTIVO' ? dineroCentavos(req.body.montoRecibido) : null;
  if (metodoPago === 'EFECTIVO' && (montoRecibidoCentavos === null || montoRecibidoCentavos < 0)) {
    return res.status(400).json({ message: 'El monto recibido no es válido' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query('SELECT idEmp FROM empleados WHERE idEmp=? FOR UPDATE', [req.empleado.idEmp]);
    const [repetidas] = await connection.query('SELECT idVenta,idEmp,idSuc FROM venta WHERE uuidVenta=? FOR UPDATE', [
      uuidVenta,
    ]);
    if (repetidas.length) {
      if (
        Number(repetidas[0].idEmp) !== Number(req.empleado.idEmp) ||
        Number(repetidas[0].idSuc) !== Number(req.empleado.idSuc)
      ) {
        const error = new Error('El identificador de venta ya está en uso.');
        error.status = 409;
        throw error;
      }
      const existente = await obtenerVentaRegistrada(connection, repetidas[0].idVenta, req.empleado);
      await connection.commit();
      return res.json(existente);
    }
    const caja = await obtenerCajaActual(connection, req.empleado.idEmp, true);
    if (!caja) {
      const error = new Error('Debes abrir caja antes de registrar ventas.');
      error.status = 409;
      throw error;
    }
    const [productos] = await connection.query(
      `
      SELECT idPro, nombrePro, precioVentaPro, existenciaPro, activoPro
      FROM productos WHERE idPro IN (?) ORDER BY idPro FOR UPDATE
    `,
      [ids],
    );
    if (productos.length !== ids.length) {
      const encontrados = new Set(productos.map((producto) => Number(producto.idPro)));
      const faltante = ids.find((id) => !encontrados.has(id));
      const error = new Error('Uno de los productos ya no está disponible');
      error.status = 404;
      error.payload = { idPro: faltante };
      throw error;
    }

    let totalCentavos = 0;
    const itemsVenta = productos.map((producto) => {
      const cantidad = cantidades.get(Number(producto.idPro));
      const disponible = Number(producto.existenciaPro) || 0;
      if (!producto.activoPro) {
        const error = new Error(`${producto.nombrePro || 'El producto'} no está disponible para venta.`);
        error.status = 409;
        error.payload = { idPro: producto.idPro };
        throw error;
      }
      if (cantidad > disponible) {
        const error = new Error(`Stock insuficiente para ${producto.nombrePro || 'el producto'}.`);
        error.status = 409;
        error.payload = { idPro: producto.idPro, disponible };
        throw error;
      }
      const precioCentavos = dineroCentavos(producto.precioVentaPro);
      if (precioCentavos === null || precioCentavos < 0) {
        const error = new Error(`${producto.nombrePro || 'El producto'} no tiene un precio válido.`);
        error.status = 409;
        error.payload = { idPro: producto.idPro };
        throw error;
      }
      const subtotalCentavos = precioCentavos * cantidad;
      totalCentavos += subtotalCentavos;
      return {
        idPro: Number(producto.idPro),
        nombre: producto.nombrePro,
        cantidad,
        precioUnitario: precioCentavos / 100,
        subtotal: subtotalCentavos / 100,
      };
    });

    if (metodoPago === 'EFECTIVO' && montoRecibidoCentavos < totalCentavos) {
      const error = new Error('El efectivo recibido es insuficiente.');
      error.status = 400;
      throw error;
    }
    const cambioCentavos = metodoPago === 'EFECTIVO' ? montoRecibidoCentavos - totalCentavos : 0;
    const montoDb = metodoPago === 'EFECTIVO' ? montoRecibidoCentavos / 100 : null;
    const [venta] = await connection.query(
      `
      INSERT INTO venta
        (uuidVenta,fechaVenta, horaVenta, total, metodoPago, montoRecibido, cambio, estadoVenta, idEmp, idSuc,idSesionCaja)
      VALUES (?,CURDATE(), CURTIME(), ?, ?, ?, ?, 'COMPLETADA', ?, ?,?)
    `,
      [
        uuidVenta,
        totalCentavos / 100,
        metodoPago,
        montoDb,
        cambioCentavos / 100,
        req.empleado.idEmp,
        req.empleado.idSuc,
        caja.idSesionCaja,
      ],
    );

    for (const item of itemsVenta) {
      await connection.query(
        `
        INSERT INTO detventa (idVenta, idPro, cantidadDetVenta, precioUnitarioDetVenta, subtotalDetVenta)
        VALUES (?, ?, ?, ?, ?)
      `,
        [venta.insertId, item.idPro, item.cantidad, item.precioUnitario, item.subtotal],
      );
      await connection.query('UPDATE productos SET existenciaPro = existenciaPro - ? WHERE idPro = ?', [
        item.cantidad,
        item.idPro,
      ]);
    }
    const registrada = await obtenerVentaRegistrada(connection, venta.insertId, req.empleado);
    await connection.commit();
    res.status(201).json(registrada);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message, ...(error.payload || {}) });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.post('/ventas/:id/cancelar', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idVenta = idValido(req.params.id);
  const motivo = texto(req.body.motivo);
  if (!idVenta) return res.status(400).json({ message: 'El folio de venta no es válido' });
  if (motivo.length < 3 || motivo.length > 255) {
    return res.status(400).json({ message: 'El motivo debe tener entre 3 y 255 caracteres' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [ventas] = await connection.query(
      `
      SELECT v.idVenta, v.estadoVenta, v.idSuc, v.idSesionCaja, sc.estado AS estadoCaja
      FROM venta v LEFT JOIN sesion_caja sc ON sc.idSesionCaja=v.idSesionCaja
      WHERE v.idVenta = ? FOR UPDATE
    `,
      [idVenta],
    );
    if (!ventas.length) {
      const error = new Error('Venta no encontrada');
      error.status = 404;
      throw error;
    }
    if (Number(ventas[0].idSuc) !== Number(req.empleado.idSuc)) {
      const error = new Error('Venta no encontrada');
      error.status = 404;
      throw error;
    }
    if (ventas[0].estadoVenta === 'CANCELADA') {
      const error = new Error('La venta ya fue cancelada.');
      error.status = 409;
      throw error;
    }
    if (ventas[0].estadoVenta !== 'COMPLETADA') {
      const error = new Error('La venta no se encuentra en un estado cancelable.');
      error.status = 409;
      throw error;
    }
    if (ventas[0].idSesionCaja && ventas[0].estadoCaja === 'CERRADA') {
      const error = new Error('La venta pertenece a una caja cerrada.');
      error.status = 409;
      throw error;
    }
    const [pedidosOnline] = await connection.query('SELECT idPedido FROM pedido_cliente WHERE idVenta = ? FOR UPDATE', [
      idVenta,
    ]);
    if (pedidosOnline.length)
      throw errorFuncional('Las ventas de pedidos online deben gestionarse desde el pedido.', 409);

    const [detalles] = await connection.query(
      `
      SELECT idPro, SUM(cantidadDetVenta) AS cantidad
      FROM detventa WHERE idVenta = ? GROUP BY idPro ORDER BY idPro
    `,
      [idVenta],
    );
    if (!detalles.length) {
      const error = new Error('La venta no contiene detalles para restaurar.');
      error.status = 409;
      throw error;
    }
    const ids = detalles.map((detalle) => Number(detalle.idPro));
    const [productos] = await connection.query(
      `
      SELECT idPro FROM productos WHERE idPro IN (?) ORDER BY idPro FOR UPDATE
    `,
      [ids],
    );
    if (productos.length !== ids.length) {
      const error = new Error('No fue posible restaurar todos los productos de la venta.');
      error.status = 409;
      throw error;
    }
    for (const detalle of detalles) {
      await connection.query(
        `
        UPDATE productos SET existenciaPro = existenciaPro + ? WHERE idPro = ?
      `,
        [Number(detalle.cantidad), Number(detalle.idPro)],
      );
    }
    await connection.query(
      `
      UPDATE venta SET estadoVenta = 'CANCELADA', fechaCancelacion = NOW(),
        motivoCancelacion = ?, idEmpCancela = ? WHERE idVenta = ?
    `,
      [motivo, req.empleado.idEmp, idVenta],
    );
    const [actualizadas] = await connection.query(
      `
      SELECT idVenta, estadoVenta,
        DATE_FORMAT(fechaCancelacion, '%Y-%m-%d %H:%i:%s') AS fechaCancelacion,
        motivoCancelacion, idEmpCancela
      FROM venta WHERE idVenta = ?
    `,
      [idVenta],
    );
    await connection.commit();
    res.json({ message: 'Venta cancelada correctamente.', venta: actualizadas[0] });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  } finally {
    connection?.release();
  }
});

app.get('/ventas', autenticar, rolesPos, async (req, res) => {
  const filtroRol = req.empleado.cargo === 'CAJERO' ? 'v.idEmp = ?' : 'v.idSuc = ?';
  const filtroValor = req.empleado.cargo === 'CAJERO' ? req.empleado.idEmp : req.empleado.idSuc;
  try {
    const [rows] = await db.query(
      `
      SELECT v.idVenta, DATE_FORMAT(v.fechaVenta, '%Y-%m-%d') AS fechaVenta,
        TIME_FORMAT(v.horaVenta, '%H:%i:%s') AS horaVenta, v.total, v.metodoPago,
        v.estadoVenta, v.idEmp, v.idSesionCaja, v.uuidVenta,
        CASE WHEN EXISTS(SELECT 1 FROM pedido_cliente pc WHERE pc.idVenta=v.idVenta) THEN 'ONLINE' ELSE 'POS' END AS origenVenta,
        TRIM(CONCAT_WS(' ', e.nombreEmp, e.apellidoPatEmp, e.apellidoMatEmp)) AS cajero
      FROM venta v LEFT JOIN empleados e ON e.idEmp = v.idEmp
      WHERE ${filtroRol}
      ORDER BY v.fechaVenta DESC, v.horaVenta DESC, v.idVenta DESC
    `,
      [filtroValor],
    );
    res.json(rows.map((row) => ({ ...row, total: Number(row.total) })));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/ventas/:id', autenticar, rolesPos, async (req, res) => {
  const idVenta = idValido(req.params.id);
  if (!idVenta) return res.status(400).json({ message: 'El folio de venta no es válido' });
  const filtroRol = req.empleado.cargo === 'CAJERO' ? 'v.idEmp = ?' : 'v.idSuc = ?';
  const filtroValor = req.empleado.cargo === 'CAJERO' ? req.empleado.idEmp : req.empleado.idSuc;
  try {
    const [ventas] = await db.query(
      `
      SELECT v.idVenta, DATE_FORMAT(v.fechaVenta, '%Y-%m-%d') AS fechaVenta,
        TIME_FORMAT(v.horaVenta, '%H:%i:%s') AS horaVenta, v.total, v.metodoPago,
        v.uuidVenta, v.idSesionCaja, v.montoRecibido, v.cambio, v.estadoVenta, v.idEmp,
        CASE WHEN pc.idPedido IS NULL THEN 'POS' ELSE 'ONLINE' END AS origenVenta, pc.idPedido,
        DATE_FORMAT(v.fechaCancelacion, '%Y-%m-%d %H:%i:%s') AS fechaCancelacion,
        v.motivoCancelacion, v.idEmpCancela,
        TRIM(CONCAT_WS(' ', e.nombreEmp, e.apellidoPatEmp, e.apellidoMatEmp)) AS cajero,
        TRIM(CONCAT_WS(' ', ec.nombreEmp, ec.apellidoPatEmp, ec.apellidoMatEmp)) AS nombreEmpleadoCancela,
        s.nombreSuc, s.descripcionSuc, s.telefonoSuc, s.correoSuc, s.logoSuc
      FROM venta v LEFT JOIN empleados e ON e.idEmp = v.idEmp
      LEFT JOIN empleados ec ON ec.idEmp = v.idEmpCancela
      LEFT JOIN sucursal s ON s.idSuc = v.idSuc
      LEFT JOIN pedido_cliente pc ON pc.idVenta = v.idVenta
      WHERE v.idVenta = ? AND ${filtroRol}
    `,
      [idVenta, filtroValor],
    );
    if (!ventas.length) return res.status(404).json({ message: 'Venta no encontrada' });
    const [items] = await db.query(
      `
      SELECT d.idPro, COALESCE(p.nombrePro, 'Producto') AS nombre,
        d.cantidadDetVenta AS cantidad, d.precioUnitarioDetVenta AS precioUnitario,
        d.subtotalDetVenta AS subtotal
      FROM detventa d LEFT JOIN productos p ON p.idPro = d.idPro
      WHERE d.idVenta = ? ORDER BY d.idDetVenta
    `,
      [idVenta],
    );
    res.json({
      ...ventas[0],
      total: Number(ventas[0].total),
      folioPedido: ventas[0].idPedido ? folioPedido(ventas[0].idPedido) : null,
      montoRecibido: ventas[0].montoRecibido === null ? null : Number(ventas[0].montoRecibido),
      cambio: Number(ventas[0].cambio),
      items: items.map((item) => ({
        ...item,
        cantidad: Number(item.cantidad),
        precioUnitario: Number(item.precioUnitario),
        subtotal: Number(item.subtotal),
      })),
    });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cargos', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT idCargo, nombreCargo, descripcionCargo, idSuc FROM cargo
      WHERE nombreCargo IN ('ADMINISTRADOR', 'CAJERO') ORDER BY nombreCargo`);
    res.json(rows);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/empleados', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const [rows] = await db.query(`${empleadoSesionSelect} ORDER BY e.nombreEmp, e.apellidoPatEmp`);
    res.json(rows.map(empleadoSeguro));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/empleados', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const correo = texto(req.body.correo).toLowerCase();
  const nombre = texto(req.body.nombre);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const idCargo = idValido(req.body.idCargo);
  if (!nombre || !correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !idCargo) {
    return res.status(400).json({ message: 'Nombre, correo y cargo válidos son obligatorios' });
  }
  if (password && password.length < 8)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  try {
    const [cargos] = await db.query(
      `SELECT idCargo FROM cargo WHERE idCargo = ? AND nombreCargo IN ('ADMINISTRADOR','CAJERO')`,
      [idCargo],
    );
    if (!cargos.length) return res.status(400).json({ message: 'El cargo no es válido' });
    const hash = password ? await bcrypt.hash(password, 12) : null;
    const [result] = await db.query(
      `INSERT INTO empleados
      (nombreEmp, apellidoPatEmp, apellidoMatEmp, correoEmp, contrasenaHash, estadoEmp, telefono, fechaIngreso, fotoPerfil, idCargo)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        nombre,
        textoNullable(req.body.apellidoPat),
        textoNullable(req.body.apellidoMat),
        correo,
        hash,
        textoNullable(req.body.telefono),
        textoNullable(req.body.fechaIngreso),
        textoNullable(req.body.fotoPerfil),
        idCargo,
      ],
    );
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE e.idEmp = ?`, [result.insertId]);
    res.status(201).json(empleadoSeguro(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El correo ya está registrado' });
    errorServidor(res, error);
  }
});

app.put('/empleados/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idEmp = idValido(req.params.id);
  const correo = texto(req.body.correo).toLowerCase();
  const nombre = texto(req.body.nombre);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const idCargo = idValido(req.body.idCargo);
  if (!idEmp || !nombre || !correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !idCargo) {
    return res.status(400).json({ message: 'Los datos del empleado no son válidos' });
  }
  if (password && password.length < 8)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  try {
    const [actuales] = await db.query('SELECT idEmp FROM empleados WHERE idEmp = ?', [idEmp]);
    if (!actuales.length) return res.status(404).json({ message: 'Empleado no encontrado' });
    const [cargos] = await db.query(
      `SELECT idCargo FROM cargo WHERE idCargo = ? AND nombreCargo IN ('ADMINISTRADOR','CAJERO')`,
      [idCargo],
    );
    if (!cargos.length) return res.status(400).json({ message: 'El cargo seleccionado no es válido' });
    const valores = [
      nombre,
      textoNullable(req.body.apellidoPat),
      textoNullable(req.body.apellidoMat),
      correo,
      textoNullable(req.body.telefono),
      textoNullable(req.body.fechaIngreso),
      textoNullable(req.body.fotoPerfil),
      idCargo,
    ];
    let sql = `UPDATE empleados SET nombreEmp=?, apellidoPatEmp=?, apellidoMatEmp=?, correoEmp=?, telefono=?, fechaIngreso=?, fotoPerfil=?, idCargo=?`;
    if (password) {
      sql += ', contrasenaHash=?';
      valores.push(await bcrypt.hash(password, 12));
    }
    await db.query(`${sql} WHERE idEmp=?`, [...valores, idEmp]);
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE e.idEmp = ?`, [idEmp]);
    res.json(empleadoSeguro(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El correo ya está registrado' });
    errorServidor(res, error);
  }
});

app.patch('/empleados/:id/estado', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idEmp = idValido(req.params.id);
  const estado = req.body.estado === true || req.body.estado === 1 ? 1 : 0;
  if (!idEmp) return res.status(400).json({ message: 'El ID del empleado no es válido' });
  if (idEmp === req.empleado.idEmp && estado === 0)
    return res.status(400).json({ message: 'No puedes desactivar tu propia sesión' });
  try {
    const [result] = await db.query('UPDATE empleados SET estadoEmp = ? WHERE idEmp = ?', [estado, idEmp]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Empleado no encontrado' });
    const [rows] = await db.query(`${empleadoSesionSelect} WHERE e.idEmp = ?`, [idEmp]);
    res.json(empleadoSeguro(rows[0]));
  } catch (error) {
    errorServidor(res, error);
  }
});

db.getConnection()
  .then((connection) => {
    console.log('Conectado a MySQL');
    connection.release();
  })
  .catch((error) => console.error('No se pudo conectar a MySQL:', error.message));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor disponible en el puerto ${port}`);
});
