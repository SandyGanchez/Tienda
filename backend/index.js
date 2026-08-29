const path = require('path');
const entornoLocal = require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true }).parsed || {};
process.env.JWT_SECRET = entornoLocal.JWT_SECRET?.trim() || '';

if (!process.env.JWT_SECRET?.trim()) {
  throw new Error('JWT_SECRET no está configurado. Define el valor en backend/.env antes de iniciar el servidor.');
}

const express = require('express');
const cors = require('cors');
const prisma = require('./prisma/client');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { rateLimit } = require('express-rate-limit');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Region = process.env.AWS_REGION || 'us-east-1';
const s3Bucket = process.env.AWS_BUCKET_NAME || 'tienda-donapaty-uploads';

const s3Config = { region: s3Region };
if (process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
  };
}
const s3Client = new S3Client(s3Config);

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

function esUrlS3(ruta) {
  if (!ruta || typeof ruta !== 'string') return false;
  return (
    ruta.includes('.amazonaws.com/') ||
    ruta.startsWith('s3://') ||
    ruta.startsWith('productos/') ||
    ruta.startsWith('tienda/') ||
    ruta.startsWith('comprobantes/')
  );
}

function extraerKeyS3(ruta) {
  if (!ruta || typeof ruta !== 'string') return null;
  if (ruta.includes('.amazonaws.com/')) {
    return ruta.split('.amazonaws.com/')[1]?.split('?')[0] || null;
  }
  if (ruta.startsWith('productos/') || ruta.startsWith('tienda/') || ruta.startsWith('comprobantes/')) {
    return ruta;
  }
  return null;
}

async function eliminarObjetoS3(rutaOKey) {
  const key = extraerKeyS3(rutaOKey);
  if (!key) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
  } catch (err) {
    console.error('Error al eliminar objeto de S3:', err?.message || err);
  }
}

function limpiarNombreArchivo(nombreOriginal, fallback = 'archivo') {
  if (!nombreOriginal || typeof nombreOriginal !== 'string') return fallback;

  let nombre = path.basename(nombreOriginal.trim());
  const parsedExt = path.extname(nombre).toLowerCase();
  let base = path.basename(nombre, parsedExt);

  base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  base = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+/, '')
    .replace(/[-_.]+$/, '');

  if (!base) base = fallback;
  base = base.slice(0, 80);

  const extLimpia = parsedExt.replace(/[^a-z0-9.]/g, '').toLowerCase();
  return `${base}${extLimpia}`;
}

async function generarPresignedUpload({ folder, mimeType, extensionOriginal, nombreArchivoOriginal }) {
  let ext = extensionOriginal || extensionesComprobante.get(mimeType) || extensionesImagen.get(mimeType) || '';
  if (ext && !ext.startsWith('.')) ext = `.${ext}`;
  ext = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');

  let nombreLimpio = '';
  if (nombreArchivoOriginal) {
    const seguro = limpiarNombreArchivo(nombreArchivoOriginal);
    nombreLimpio = path.basename(seguro, path.extname(seguro)).slice(0, 40);
  }

  const nombreFichero = nombreLimpio ? `${crypto.randomUUID()}-${nombreLimpio}${ext}` : `${crypto.randomUUID()}${ext}`;
  const key = `${folder}/${nombreFichero}`;

  const command = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  const publicUrl = `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}`;
  return { uploadUrl, key, publicUrl, fileName: nombreFichero };
}

async function generarPresignedDownload(key, filename, mimeType) {
  const nombreLimpio = limpiarNombreArchivo(filename || path.basename(key) || 'comprobante');
  const command = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    ResponseContentType: mimeType || undefined,
    ResponseContentDisposition: `inline; filename="${nombreLimpio}"; filename*=UTF-8''${encodeURIComponent(nombreLimpio)}`,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 900 });
}

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

    if (payload.tipo && payload.tipo !== 'EMPLEADO') {
      return res.status(401).json({
        message: 'Sesión no válida',
      });
    }

    const idEmp = idValido(payload.sub);
    if (!idEmp) return res.status(401).json({ message: 'Sesión no válida' });

    const empleado = await prisma.empleado.findUnique({
      where: { idEmp },
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });

    if (!empleado || !empleado.estadoEmp || !empleado.cargo) {
      return res.status(401).json({ message: 'Sesión no válida' });
    }

    req.empleado = {
      idEmp: empleado.idEmp,
      nombreEmp: empleado.nombreEmp,
      apellidoPatEmp: empleado.apellidoPatEmp,
      apellidoMatEmp: empleado.apellidoMatEmp,
      correoEmp: empleado.correoEmp,
      contrasenaHash: empleado.contrasenaHash,
      estadoEmp: empleado.estadoEmp,
      googleSub: empleado.googleSub,
      telefono: empleado.telefono,
      fotoPerfil: empleado.fotoPerfil,
      fechaIngreso: empleado.fechaIngreso,
      idCargo: empleado.idCargo,
      cargo: empleado.cargo?.nombreCargo,
      idSuc: empleado.cargo?.idSuc,
      nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
    };
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
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'tienda-api',
    });

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

    const cliente = await prisma.cliente.findUnique({
      where: { idCliente },
    });

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
  const s = await prisma.sucursal.findUnique({
    where: { idSuc: Number(idSuc) },
    include: { direccion: true },
  });
  if (!s) return null;
  const d = s.direccion;
  const direccionStr = d
    ? [d.calle, [d.noExt, d.noInt].filter(Boolean).join(' '), d.colonia, d.municipio, d.estado, d.codPostal, d.pais]
        .filter(Boolean)
        .join(', ') || null
    : null;

  return {
    idSuc: s.idSuc,
    nombreSuc: s.nombreSuc,
    descripcionSuc: s.descripcionSuc,
    telefonoSuc: s.telefonoSuc,
    correoSuc: s.correoSuc,
    paginaWebSuc: s.paginaWebSuc,
    redSocialSuc: s.redSocialSuc,
    logoSuc: s.logoSuc,
    idDir: s.idDir,
    direccion: direccionStr,
  };
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
  if (!rutaPublica) return;
  if (esUrlS3(rutaPublica)) {
    eliminarObjetoS3(rutaPublica);
    return;
  }
  if (!rutaPublica.startsWith(prefijo)) return;
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
  if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === '23503')) {
    return res.status(409).json({ message: 'No se puede eliminar porque el registro está en uso' });
  }
  return res.status(500).json({ message: 'Ocurrió un error interno en el servidor' });
}

async function obtenerProducto(idPro) {
  const p = await prisma.producto.findUnique({
    where: { idPro: Number(idPro) },
    include: {
      marca: true,
      categoria: true,
    },
  });
  if (!p) return null;
  return {
    idPro: p.idPro,
    nombrePro: p.nombrePro,
    precioVentaPro: Number(p.precioVentaPro),
    costoPro: p.costoPro !== null && p.costoPro !== undefined ? Number(p.costoPro) : null,
    existenciaPro: p.existenciaPro,
    stockMinimoPro: p.stockMinimoPro,
    tamanoPro: p.tamanoPro,
    presentacionPro: p.presentacionPro,
    tipoPro: p.tipoPro,
    codigoQR: p.codigoQR,
    skuPro: p.skuPro,
    imagenPro: p.imagenPro,
    idMarca: p.idMarca,
    idCat: p.idCat,
    nombreMarca: p.marca?.nombreMarca || null,
    nombreCat: p.categoria?.nombreCat || null,
    activoPro: p.activoPro,
  };
}

async function validarCatalogosProducto(producto) {
  const [marca, categoria] = await Promise.all([
    producto.idMarca ? prisma.marca.findUnique({ where: { idMarca: Number(producto.idMarca) } }) : null,
    producto.idCat ? prisma.categoria.findUnique({ where: { idCat: Number(producto.idCat) } }) : null,
  ]);
  if (producto.idMarca && !marca) return 'La marca seleccionada no existe';
  if (producto.idCat && !categoria) return 'La categoría seleccionada no existe';
  return null;
}

async function codigoEnUso(codigoQR, idPro = 0) {
  const codigo = texto(codigoQR);
  if (!codigo) return false;
  const existente = await prisma.producto.findFirst({
    where: {
      codigoQR: codigo,
      NOT: { idPro: Number(idPro) },
    },
    select: { idPro: true },
  });
  return Boolean(existente);
}

app.post('/uploads/presign', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1];
  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({ message: 'Sesión no válida' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'tienda-api' });
  } catch {
    return res.status(401).json({ message: 'Sesión no válida' });
  }

  const tipo = texto(req.body?.tipo).toUpperCase();
  const mimeType = texto(req.body?.mimeType).toLowerCase();
  const extension = texto(req.body?.extension).toLowerCase();

  const carpetasPorTipo = {
    PRODUCTO: 'productos',
    TIENDA: 'tienda',
    COMPROBANTE: 'comprobantes',
  };

  const carpeta = carpetasPorTipo[tipo];
  if (!carpeta) {
    return res.status(400).json({ message: 'Tipo de upload no válido. Usa PRODUCTO, TIENDA o COMPROBANTE.' });
  }

  if (tipo === 'COMPROBANTE') {
    if (payload.tipo !== 'CLIENTE' && payload.tipo !== 'EMPLEADO') {
      return res.status(403).json({ message: 'No autorizado' });
    }
    if (!extensionesComprobante.has(mimeType)) {
      return res.status(400).json({ message: 'MIME type no permitido para comprobante (JPG, PNG, WEBP, PDF).' });
    }
  } else {
    if (payload.tipo === 'CLIENTE') {
      return res.status(403).json({ message: 'No autorizado' });
    }
    if (!extensionesImagen.has(mimeType)) {
      return res.status(400).json({ message: 'MIME type no permitido para imagen (JPG, PNG, WEBP).' });
    }
  }

  const nombreOriginal = texto(req.body?.filename || req.body?.nombreOriginal || req.body?.nombre);

  try {
    const data = await generarPresignedUpload({
      folder: carpeta,
      mimeType,
      extensionOriginal: extension || undefined,
      nombreArchivoOriginal: nombreOriginal || undefined,
    });
    res.json({
      ...data,
      rutaPublica: data.publicUrl,
      expiresIn: 900,
    });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/public/tienda', async (req, res) => {
  try {
    const sucursales = await prisma.sucursal.findMany({
      orderBy: { idSuc: 'asc' },
      select: {
        idSuc: true,
        nombreSuc: true,
        descripcionSuc: true,
        logoSuc: true,
      },
    });
    res.json(sucursales);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/public/productos', async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      orderBy: { nombrePro: 'asc' },
      include: {
        marca: true,
        categoria: true,
      },
    });
    res.json(
      productos.map((p) => ({
        idPro: p.idPro,
        nombrePro: p.nombrePro,
        precioVentaPro: Number(p.precioVentaPro),
        existenciaPro: p.existenciaPro,
        tamanoPro: p.tamanoPro,
        presentacionPro: p.presentacionPro,
        tipoPro: p.tipoPro,
        imagenPro: p.imagenPro,
        nombreMarca: p.marca?.nombreMarca || null,
        nombreCat: p.categoria?.nombreCat || null,
      })),
    );
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
  const correo = texto(req.body.correo).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!correo || !password) return res.status(400).json({ message: 'Correo y contraseña son obligatorios' });
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { correoEmp: { equals: correo, mode: 'insensitive' } },
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    if (!empleado?.contrasenaHash || !(await bcrypt.compare(password, empleado.contrasenaHash))) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }
    if (!empleado.estadoEmp) return res.status(403).json({ message: 'Tu cuenta está desactivada' });
    if (!['ADMINISTRADOR', 'CAJERO'].includes(empleado.cargo?.nombreCargo)) {
      return res.status(403).json({ message: 'Tu cuenta no tiene un cargo autorizado' });
    }
    const empSeguro = empleadoSeguro({
      ...empleado,
      cargo: empleado.cargo?.nombreCargo,
      idSuc: empleado.cargo?.idSuc,
      nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
    });
    res.json({ token: emitirSesion(empSeguro), empleado: empSeguro });
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
    let empleado = await prisma.empleado.findFirst({
      where: { correoEmp: { equals: perfil.email.toLowerCase(), mode: 'insensitive' } },
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    if (!empleado) return res.status(403).json({ message: 'Esta cuenta no está autorizada para acceder' });
    if (!empleado.estadoEmp) return res.status(403).json({ message: 'Tu cuenta está desactivada' });
    if (!['ADMINISTRADOR', 'CAJERO'].includes(empleado.cargo?.nombreCargo)) {
      return res.status(403).json({ message: 'Tu cuenta no tiene un cargo autorizado' });
    }
    if (empleado.googleSub && empleado.googleSub !== perfil.sub) {
      return res.status(403).json({ message: 'Esta cuenta Google no coincide con la cuenta vinculada' });
    }
    if (!empleado.googleSub) {
      empleado = await prisma.empleado.update({
        where: { idEmp: empleado.idEmp },
        data: { googleSub: perfil.sub },
        include: {
          cargo: {
            include: { sucursal: true },
          },
        },
      });
    }
    const empSeguro = empleadoSeguro({
      ...empleado,
      cargo: empleado.cargo?.nombreCargo,
      idSuc: empleado.cargo?.idSuc,
      nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
    });
    res.json({ token: emitirSesion(empSeguro), empleado: empSeguro });
  } catch (error) {
    console.error('No fue posible verificar Google:', error.message);
    res.status(401).json({ message: 'No fue posible verificar la cuenta de Google' });
  }
});

async function resolverClienteGoogle(perfil) {
  const correo = perfil.email.trim().toLowerCase().slice(0, 150);
  const googleSub = perfil.sub.trim().slice(0, 255);
  const nombreCompleto = texto(perfil.name);
  const nombre = (texto(perfil.given_name) || nombreCompleto || correo.split('@')[0]).slice(0, 100);
  const apellidoPat = texto(perfil.family_name).slice(0, 100) || null;
  const fotoPerfil = texto(perfil.picture) || null;

  return await prisma.$transaction(async (tx) => {
    let cliente = await tx.cliente.findUnique({
      where: { googleSub },
    });

    if (!cliente) {
      cliente = await tx.cliente.findFirst({
        where: { correoCliente: { equals: correo, mode: 'insensitive' } },
      });
      if (cliente && cliente.googleSub !== googleSub) {
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

    if (!cliente) {
      cliente = await tx.cliente.create({
        data: {
          nombreCliente: nombre,
          apellidoPatCliente: apellidoPat,
          correoCliente: correo,
          googleSub,
          fotoPerfil,
          estadoCliente: true,
          ultimoAcceso: new Date(),
        },
      });
    } else {
      cliente = await tx.cliente.update({
        where: { idCliente: cliente.idCliente },
        data: {
          ultimoAcceso: new Date(),
          fotoPerfil: fotoPerfil || cliente.fotoPerfil,
        },
      });
    }

    return cliente;
  });
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
    const productos = await prisma.producto.findMany({
      orderBy: { nombrePro: 'asc' },
      include: {
        marca: true,
        categoria: true,
      },
    });
    res.json(
      productos.map((p) => ({
        idPro: p.idPro,
        nombrePro: p.nombrePro,
        precioVentaPro: Number(p.precioVentaPro),
        costoPro: p.costoPro !== null && p.costoPro !== undefined ? Number(p.costoPro) : null,
        existenciaPro: p.existenciaPro,
        stockMinimoPro: p.stockMinimoPro,
        tamanoPro: p.tamanoPro,
        presentacionPro: p.presentacionPro,
        tipoPro: p.tipoPro,
        codigoQR: p.codigoQR,
        skuPro: p.skuPro,
        imagenPro: p.imagenPro,
        idMarca: p.idMarca,
        idCat: p.idCat,
        nombreMarca: p.marca?.nombreMarca || null,
        nombreCat: p.categoria?.nombreCat || null,
        activoPro: p.activoPro,
      })),
    );
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/productos/qr/:codigo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const p = await prisma.producto.findUnique({
      where: { codigoQR: req.params.codigo },
      include: {
        marca: true,
        categoria: true,
      },
    });
    if (!p) return res.json(null);
    res.json({
      idPro: p.idPro,
      nombrePro: p.nombrePro,
      precioVentaPro: Number(p.precioVentaPro),
      costoPro: p.costoPro !== null && p.costoPro !== undefined ? Number(p.costoPro) : null,
      existenciaPro: p.existenciaPro,
      stockMinimoPro: p.stockMinimoPro,
      tamanoPro: p.tamanoPro,
      presentacionPro: p.presentacionPro,
      tipoPro: p.tipoPro,
      codigoQR: p.codigoQR,
      skuPro: p.skuPro,
      imagenPro: p.imagenPro,
      idMarca: p.idMarca,
      idCat: p.idCat,
      nombreMarca: p.marca?.nombreMarca || null,
      nombreCat: p.categoria?.nombreCat || null,
      activoPro: p.activoPro,
    });
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

  try {
    const errorCatalogos = await validarCatalogosProducto(req.body);
    if (errorCatalogos) return res.status(400).json({ message: errorCatalogos });
    if (await codigoEnUso(req.body.codigoQR)) {
      return res.status(409).json({ message: 'El código de barras ya pertenece a otro producto' });
    }

    const nuevo = await prisma.producto.create({
      data: {
        nombrePro: texto(req.body.nombre),
        precioVentaPro: Number(req.body.precio),
        costoPro:
          req.body.costo !== null && req.body.costo !== undefined && req.body.costo !== '' ? Number(req.body.costo) : 0,
        existenciaPro: Number(req.body.existencia),
        stockMinimoPro: req.body.stockMinimo ? Number(req.body.stockMinimo) : 1,
        tamanoPro: textoNullable(req.body.tamano),
        presentacionPro: textoNullable(req.body.presentacion),
        tipoPro: textoNullable(req.body.tipo),
        codigoQR: textoNullable(req.body.codigoQR),
        skuPro: textoNullable(req.body.sku),
        imagenPro: textoNullable(req.body.imagen),
        idMarca: req.body.idMarca ? Number(req.body.idMarca) : null,
        idCat: req.body.idCat ? Number(req.body.idCat) : null,
      },
    });

    const producto = await obtenerProducto(nuevo.idPro);
    res.status(201).json(producto);
  } catch (error) {
    errorServidor(res, error);
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
      await prisma.producto.update({ where: { idPro }, data: { imagenPro: rutaPublica } });
      const producto = await obtenerProducto(idPro);
      if (!producto) throw new Error('No se pudo recuperar el producto después de subir la imagen');
      return res.json(producto);
    } catch (error) {
      fs.unlink(req.file.path, () => undefined);
      return errorServidor(res, error);
    }
  });
});

app.post('/productos/:id/presign-imagen', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idPro = idValido(req.params.id);
  if (!idPro) return res.status(400).json({ message: 'El ID del producto no es válido' });
  const mimeType = texto(req.body?.mimeType).toLowerCase();
  const nombreOriginal = texto(req.body?.filename || req.body?.nombreOriginal);
  if (!extensionesImagen.has(mimeType)) {
    return res.status(400).json({ message: 'Solo se permiten imágenes JPEG, PNG o WEBP' });
  }
  try {
    const producto = await obtenerProducto(idPro);
    if (!producto) return res.status(404).json({ message: 'Producto no encontrado' });
    const presigned = await generarPresignedUpload({
      folder: 'productos',
      mimeType,
      nombreArchivoOriginal: nombreOriginal || undefined,
    });
    res.json({ ...presigned, idPro, expiresIn: 900 });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/productos/:id/confirmar-imagen', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idPro = idValido(req.params.id);
  if (!idPro) return res.status(400).json({ message: 'El ID del producto no es válido' });
  const imagenUrl = texto(req.body?.imagenUrl || req.body?.publicUrl || req.body?.key);
  if (!imagenUrl) return res.status(400).json({ message: 'La URL o Key de la imagen es obligatoria' });

  try {
    const anterior = await obtenerProducto(idPro);
    if (!anterior) return res.status(404).json({ message: 'Producto no encontrado' });

    const rutaFinal =
      imagenUrl.startsWith('http://') || imagenUrl.startsWith('https://') || imagenUrl.startsWith('/uploads')
        ? imagenUrl
        : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${imagenUrl}`;

    await prisma.producto.update({ where: { idPro }, data: { imagenPro: rutaFinal } });

    if (anterior.imagenPro && anterior.imagenPro !== rutaFinal) {
      eliminarUploadControlado(anterior.imagenPro, productosUploadDir, '/uploads/productos/');
    }

    const actualizado = await obtenerProducto(idPro);
    res.json(actualizado);
  } catch (error) {
    errorServidor(res, error);
  }
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

    await prisma.producto.update({
      where: { idPro },
      data: {
        nombrePro: texto(req.body.nombre),
        precioVentaPro: Number(req.body.precio),
        costoPro:
          req.body.costo !== null && req.body.costo !== undefined && req.body.costo !== '' ? Number(req.body.costo) : 0,
        existenciaPro: Number(req.body.existencia),
        stockMinimoPro: req.body.stockMinimo ? Number(req.body.stockMinimo) : 1,
        tamanoPro: textoNullable(req.body.tamano),
        presentacionPro: textoNullable(req.body.presentacion),
        tipoPro: textoNullable(req.body.tipo),
        codigoQR: textoNullable(req.body.codigoQR),
        skuPro: textoNullable(req.body.sku),
        imagenPro: textoNullable(req.body.imagen),
        idMarca: req.body.idMarca ? Number(req.body.idMarca) : null,
        idCat: req.body.idCat ? Number(req.body.idCat) : null,
      },
    });
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
    const [ventas, compras, pedidos] = await Promise.all([
      prisma.detVenta.count({ where: { idPro } }),
      prisma.detCompra.count({ where: { idPro } }),
      prisma.detallePedidoCliente.count({ where: { idPro } }),
    ]);
    if (ventas > 0 || compras > 0 || pedidos > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar el producto porque tiene ventas, compras o pedidos relacionados',
      });
    }
    await prisma.producto.delete({ where: { idPro } });
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/marca', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const marcas = await prisma.marca.findMany({
      orderBy: { nombreMarca: 'asc' },
    });
    res.json(marcas);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/marca', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const nombre = texto(req.body.nombre);
  if (!nombre) return res.status(400).json({ message: 'El nombre de la marca es obligatorio' });
  try {
    const marca = await prisma.marca.create({
      data: {
        nombreMarca: nombre,
        descripMarca: textoNullable(req.body.descripcion),
      },
    });
    res.status(201).json(marca);
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
    const marca = await prisma.marca.update({
      where: { idMarca },
      data: {
        nombreMarca: nombre,
        descripMarca: textoNullable(req.body.descripcion),
      },
    });
    res.json(marca);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Marca no encontrada' });
    errorServidor(res, error);
  }
});

app.delete('/marca/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idMarca = idValido(req.params.id);
  if (!idMarca) return res.status(400).json({ message: 'El ID de la marca no es válido' });
  try {
    const marca = await prisma.marca.findUnique({ where: { idMarca } });
    if (!marca) return res.status(404).json({ message: 'Marca no encontrada' });
    const productos = await prisma.producto.count({ where: { idMarca } });
    if (productos > 0) {
      return res.status(409).json({ message: 'No se puede eliminar la marca porque tiene productos asociados' });
    }
    await prisma.marca.delete({ where: { idMarca } });
    res.json({ message: 'Marca eliminada correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/categoria', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombreCat: 'asc' },
    });
    res.json(categorias);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/categoria', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const nombre = texto(req.body.nombre);
  if (!nombre) return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  try {
    const categoria = await prisma.categoria.create({
      data: {
        nombreCat: nombre,
        descripCat: textoNullable(req.body.descripcion),
      },
    });
    res.status(201).json(categoria);
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
    const categoria = await prisma.categoria.update({
      where: { idCat },
      data: {
        nombreCat: nombre,
        descripCat: textoNullable(req.body.descripcion),
      },
    });
    res.json(categoria);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Categoría no encontrada' });
    errorServidor(res, error);
  }
});

app.delete('/categoria/:id', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idCat = idValido(req.params.id);
  if (!idCat) return res.status(400).json({ message: 'El ID de la categoría no es válido' });
  try {
    const categoria = await prisma.categoria.findUnique({ where: { idCat } });
    if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' });
    const productos = await prisma.producto.count({ where: { idCat } });
    if (productos > 0) {
      return res.status(409).json({ message: 'No se puede eliminar la categoría porque tiene productos asociados' });
    }
    await prisma.categoria.delete({ where: { idCat } });
    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/sucursal', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const sucursales = await prisma.sucursal.findMany({
      orderBy: [{ nombreSuc: 'asc' }, { idSuc: 'asc' }],
      include: { direccion: true },
    });
    res.json(
      sucursales.map((s) => {
        const d = s.direccion;
        const direccionStr = d
          ? [
              d.calle,
              [d.noExt, d.noInt].filter(Boolean).join(' '),
              d.colonia,
              d.municipio,
              d.estado,
              d.codPostal,
              d.pais,
            ]
              .filter(Boolean)
              .join(', ') || null
          : null;
        return {
          idSuc: s.idSuc,
          nombreSuc: s.nombreSuc,
          descripcionSuc: s.descripcionSuc,
          telefonoSuc: s.telefonoSuc,
          correoSuc: s.correoSuc,
          paginaWebSuc: s.paginaWebSuc,
          redSocialSuc: s.redSocialSuc,
          logoSuc: s.logoSuc,
          idDir: s.idDir,
          direccion: direccionStr,
        };
      }),
    );
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
    const nueva = await prisma.sucursal.create({
      data: {
        nombreSuc: texto(req.body.nombreSuc),
        descripcionSuc: textoNullable(req.body.descripcionSuc),
        telefonoSuc: textoNullable(req.body.telefonoSuc),
        correoSuc: textoNullable(req.body.correoSuc),
        paginaWebSuc: textoNullable(req.body.paginaWebSuc),
        redSocialSuc: textoNullable(req.body.redSocialSuc),
      },
    });
    res.status(201).json(await obtenerSucursal(nueva.idSuc));
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
    await prisma.sucursal.update({
      where: { idSuc },
      data: {
        nombreSuc: texto(req.body.nombreSuc),
        descripcionSuc: textoNullable(req.body.descripcionSuc),
        telefonoSuc: textoNullable(req.body.telefonoSuc),
        correoSuc: textoNullable(req.body.correoSuc),
        paginaWebSuc: textoNullable(req.body.paginaWebSuc),
        redSocialSuc: textoNullable(req.body.redSocialSuc),
      },
    });
    res.json(await obtenerSucursal(idSuc));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Sucursal no encontrada' });
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
      await prisma.sucursal.update({ where: { idSuc }, data: { logoSuc: rutaPublica } });
      const sucursal = await obtenerSucursal(idSuc);
      eliminarUploadControlado(anterior.logoSuc, tiendaUploadDir, '/uploads/tienda/');
      res.json(sucursal);
    } catch (error) {
      fs.unlink(req.file.path, () => undefined);
      errorServidor(res, error);
    }
  });
});

app.post('/sucursal/:id/presign-logo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  const mimeType = texto(req.body?.mimeType).toLowerCase();
  const nombreOriginal = texto(req.body?.filename || req.body?.nombreOriginal);
  if (!extensionesImagen.has(mimeType)) {
    return res.status(400).json({ message: 'Solo se permiten imágenes JPEG, PNG o WEBP' });
  }
  try {
    const sucursal = await obtenerSucursal(idSuc);
    if (!sucursal) return res.status(404).json({ message: 'Sucursal no encontrada' });
    const presigned = await generarPresignedUpload({
      folder: 'tienda',
      mimeType,
      nombreArchivoOriginal: nombreOriginal || undefined,
    });
    res.json({ ...presigned, idSuc, expiresIn: 900 });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/sucursal/:id/confirmar-logo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  const logoUrl = texto(req.body?.logoUrl || req.body?.publicUrl || req.body?.key);
  if (!logoUrl) return res.status(400).json({ message: 'La URL o Key del logo es obligatoria' });

  try {
    const anterior = await obtenerSucursal(idSuc);
    if (!anterior) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const rutaFinal =
      logoUrl.startsWith('http://') || logoUrl.startsWith('https://') || logoUrl.startsWith('/uploads')
        ? logoUrl
        : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${logoUrl}`;

    await prisma.sucursal.update({ where: { idSuc }, data: { logoSuc: rutaFinal } });

    if (anterior.logoSuc && anterior.logoSuc !== rutaFinal) {
      eliminarUploadControlado(anterior.logoSuc, tiendaUploadDir, '/uploads/tienda/');
    }

    const actualizado = await obtenerSucursal(idSuc);
    res.json(actualizado);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.delete('/sucursal/:id/logo', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idSuc = idValido(req.params.id);
  if (!idSuc) return res.status(400).json({ message: 'El ID de la sucursal no es válido' });
  try {
    const anterior = await obtenerSucursal(idSuc);
    if (!anterior) return res.status(404).json({ message: 'Sucursal no encontrada' });
    await prisma.sucursal.update({ where: { idSuc }, data: { logoSuc: null } });
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

async function obtenerSucursalDisponibleCliente() {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { idSuc: 'asc' },
    take: 2,
    select: { idSuc: true },
  });
  if (!sucursales.length) throw errorFuncional('No hay una sucursal disponible para recibir pedidos.', 409);
  if (sucursales.length > 1) {
    throw errorFuncional('Selecciona una sucursal antes de continuar con tu pedido.', 409);
  }
  return Number(sucursales[0].idSuc);
}

async function obtenerConfiguracionTransferencia(idSucOrExecutor, idSucParam, exigirActivaParam) {
  let idSuc = idSucOrExecutor;
  let exigirActiva = true;
  if (typeof idSucOrExecutor === 'object' || isNaN(Number(idSucOrExecutor))) {
    idSuc = idSucParam;
    exigirActiva = exigirActivaParam !== undefined ? exigirActivaParam : true;
  } else if (idSucParam !== undefined && typeof idSucParam === 'boolean') {
    exigirActiva = idSucParam;
  }
  const configuracion = await prisma.configuracionTransferencia.findUnique({
    where: { idSuc: Number(idSuc) },
  });
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

async function obtenerPedidoSeguro(idPedido, idCliente, client = prisma) {
  const p = await client.pedidoCliente.findFirst({
    where: {
      idPedido: Number(idPedido),
      idCliente: Number(idCliente),
    },
    include: {
      detalles: {
        include: { producto: true },
        orderBy: { idDetallePedido: 'asc' },
      },
    },
  });
  if (!p) return null;

  let configuracionTransferencia = configuracionTransferenciaPedido(p);
  if (!configuracionTransferencia) {
    try {
      const conf = await client.configuracionTransferencia.findUnique({
        where: { idSuc: p.idSuc },
      });
      configuracionTransferencia = normalizarConfiguracionTransferencia(conf);
    } catch {
      configuracionTransferencia = null;
    }
  }

  return {
    ...normalizarPedido(p),
    items: p.detalles.map((d) => ({
      idPro: d.idPro,
      nombre: d.producto?.nombrePro || 'Producto',
      imagen: d.producto?.imagenPro || null,
      presentacion: [d.producto?.tamanoPro, d.producto?.presentacionPro].filter(Boolean).join(' · ') || null,
      cantidad: d.cantidad,
      precioUnitario: Number(d.precioUnitario),
      subtotal: Number(d.subtotal),
    })),
    configuracionTransferencia,
  };
}

async function restaurarStockPedido(tx, idPedido) {
  const detalles = await tx.detallePedidoCliente.findMany({
    where: { idPedido: Number(idPedido) },
    orderBy: { idPro: 'asc' },
  });
  for (const d of detalles) {
    await tx.producto.update({
      where: { idPro: d.idPro },
      data: { existenciaPro: { increment: d.cantidad } },
    });
  }
}

async function expirarPedidoBloqueado(tx, pedido) {
  const vencido =
    pedido.estado === 'PENDIENTE_PAGO' &&
    !pedido.comprobanteRuta &&
    pedido.fechaLimitePago &&
    new Date(pedido.fechaLimitePago).getTime() < Date.now();
  if (!vencido) return false;

  await restaurarStockPedido(tx, Number(pedido.idPedido));
  await tx.pedidoCliente.update({
    where: { idPedido: Number(pedido.idPedido) },
    data: { estado: 'EXPIRADO' },
  });
  return true;
}

async function liberarPedidosExpirados(idCliente = null) {
  const where = {
    estado: 'PENDIENTE_PAGO',
    comprobanteRuta: null,
    fechaLimitePago: { lt: new Date() },
  };
  if (idCliente) where.idCliente = Number(idCliente);

  const candidatos = await prisma.pedidoCliente.findMany({
    where,
    select: { idPedido: true },
    orderBy: { idPedido: 'asc' },
    take: 50,
  });

  for (const candidato of candidatos) {
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.pedidoCliente.findUnique({
          where: { idPedido: candidato.idPedido },
        });
        if (p) await expirarPedidoBloqueado(tx, p);
      });
    } catch (error) {
      console.error('No se pudo liberar un pedido expirado:', error.message);
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
    const configuracion = await prisma.configuracionTransferencia.findUnique({
      where: { idSuc },
    });
    res.json({ configuracion: normalizarConfiguracionTransferencia(configuracion, true) });
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
    const configuracion = await prisma.configuracionTransferencia.upsert({
      where: { idSuc },
      update: {
        banco: datos.banco,
        titular: datos.titular,
        clabe: datos.clabe,
        numeroCuenta: datos.numeroCuenta,
        instrucciones: datos.instrucciones,
        activo: datos.activo,
        fechaActualizacion: new Date(),
      },
      create: {
        idSuc,
        banco: datos.banco,
        titular: datos.titular,
        clabe: datos.clabe,
        numeroCuenta: datos.numeroCuenta,
        instrucciones: datos.instrucciones,
        activo: datos.activo,
      },
    });
    res.json({ configuracion: normalizarConfiguracionTransferencia(configuracion, true) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cliente/configuracion-transferencia', autenticarCliente, async (req, res) => {
  try {
    const idSuc = await obtenerSucursalDisponibleCliente();
    const configuracion = await obtenerConfiguracionTransferencia(idSuc, true);
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

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const repetido = await tx.pedidoCliente.findUnique({
        where: { uuidPedido },
      });
      if (repetido) {
        if (Number(repetido.idCliente) !== idCliente) {
          throw errorFuncional('El identificador del pedido ya está en uso.', 409);
        }
        return await obtenerPedidoSeguro(repetido.idPedido, idCliente, tx);
      }

      const idSuc = await obtenerSucursalDisponibleCliente();
      const configuracion = await obtenerConfiguracionTransferencia(tx, idSuc, true);

      const ids = itemsSolicitados.map(([idPro]) => idPro);
      const productos = await tx.producto.findMany({
        where: { idPro: { in: ids } },
        orderBy: { idPro: 'asc' },
      });

      if (productos.length !== ids.length) throw errorFuncional('Uno de los productos ya no está disponible.', 409);
      const porId = new Map(productos.map((producto) => [Number(producto.idPro), producto]));
      const detalles = [];
      let totalCentavos = 0;

      for (const [idPro, cantidad] of itemsSolicitados) {
        const producto = porId.get(idPro);
        if (!producto || !producto.activoPro) {
          throw errorFuncional(`${producto?.nombrePro || 'Un producto'} ya no está disponible.`, 409);
        }
        if (!Number.isInteger(Number(producto.existenciaPro)) || Number(producto.existenciaPro) < cantidad) {
          throw errorFuncional(`Stock insuficiente para ${producto.nombrePro}.`, 409);
        }
        const precioCentavos = dineroCentavos(producto.precioVentaPro);
        if (precioCentavos === null || precioCentavos < 0) {
          throw errorFuncional(`El precio de ${producto.nombrePro} no es válido.`, 409);
        }
        const subtotalCentavos = precioCentavos * cantidad;
        if (!Number.isSafeInteger(subtotalCentavos)) {
          throw errorFuncional('El total solicitado supera el límite permitido.', 400);
        }
        totalCentavos += subtotalCentavos;
        if (!Number.isSafeInteger(totalCentavos) || totalCentavos > MAX_TOTAL_PEDIDO_CENTAVOS) {
          throw errorFuncional('El total solicitado supera el límite permitido.', 400);
        }
        detalles.push({ idPro, cantidad, precioCentavos, subtotalCentavos });
      }

      const fechaLimitePago = new Date(Date.now() + HORAS_RESERVA_PEDIDO * 60 * 60 * 1000);

      const nuevoPedido = await tx.pedidoCliente.create({
        data: {
          uuidPedido,
          idCliente,
          idSuc,
          total: totalCentavos / 100,
          estado: 'PENDIENTE_PAGO',
          fechaLimitePago,
          bancoSnapshot: configuracion.banco,
          titularSnapshot: configuracion.titular,
          clabeSnapshot: configuracion.clabe,
          numeroCuentaSnapshot: configuracion.numeroCuenta,
          instruccionesSnapshot: configuracion.instrucciones,
          detalles: {
            create: detalles.map((d) => ({
              idPro: d.idPro,
              cantidad: d.cantidad,
              precioUnitario: d.precioCentavos / 100,
              subtotal: d.subtotalCentavos / 100,
            })),
          },
        },
      });

      for (const d of detalles) {
        await tx.producto.update({
          where: { idPro: d.idPro },
          data: { existenciaPro: { decrement: d.cantidad } },
        });
      }

      return await obtenerPedidoSeguro(nuevoPedido.idPedido, idCliente, tx);
    });

    res.status(201).json(pedido);
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
      try {
        const existente = await prisma.pedidoCliente.findUnique({ where: { uuidPedido } });
        if (existente && Number(existente.idCliente) === idCliente) {
          return res.json(await obtenerPedidoSeguro(existente.idPedido, idCliente));
        }
        return res.status(409).json({ message: 'El identificador del pedido ya está en uso.' });
      } catch (consultaError) {
        return errorServidor(res, consultaError);
      }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    return errorServidor(res, error);
  }
});

app.get('/cliente/pedidos', autenticarCliente, async (req, res) => {
  const idCliente = Number(req.cliente.idCliente);
  try {
    await liberarPedidosExpirados(idCliente);
    const pedidos = await prisma.pedidoCliente.findMany({
      where: { idCliente },
      orderBy: [{ fechaPedido: 'desc' }, { idPedido: 'desc' }],
    });
    res.json(pedidos.map(normalizarPedido));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cliente/pedidos/:id', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    await liberarPedidosExpirados(Number(req.cliente.idCliente));
    const pedido = await obtenerPedidoSeguro(idPedido, Number(req.cliente.idCliente));
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado.' });
    res.json(pedido);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/cliente/pedidos/:id/cancelar', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });

  try {
    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idCliente: req.cliente.idCliente },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);

      if (await expirarPedidoBloqueado(tx, pedido)) {
        throw errorFuncional('Tu reserva expiró y los productos volvieron al inventario.', 409);
      }

      if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
        throw errorFuncional(`El pedido ya no puede cancelarse porque está ${pedido.estado}.`, 409);
      }

      await restaurarStockPedido(tx, idPedido);
      await tx.pedidoCliente.update({
        where: { idPedido },
        data: { estado: 'CANCELADO' },
      });

      return await obtenerPedidoSeguro(idPedido, Number(req.cliente.idCliente), tx);
    });

    res.json(actualizado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
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

    try {
      const actualizado = await prisma.$transaction(async (tx) => {
        const pedido = await tx.pedidoCliente.findFirst({
          where: { idPedido, idCliente: req.cliente.idCliente },
        });
        if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);

        if (await expirarPedidoBloqueado(tx, pedido)) {
          throw errorFuncional('Tu reserva expiró y los productos volvieron al inventario.', 409);
        }
        if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
          throw errorFuncional('Este pedido ya no acepta comprobantes.', 409);
        }

        await tx.pedidoCliente.update({
          where: { idPedido },
          data: {
            comprobanteRuta: req.file.filename,
            comprobanteMime: req.file.mimetype,
            comprobanteNombre: texto(req.file.originalname).slice(0, 255) || 'comprobante',
            fechaComprobante: new Date(),
            estado: 'EN_REVISION',
          },
        });

        return await obtenerPedidoSeguro(idPedido, Number(req.cliente.idCliente), tx);
      });

      res.json(actualizado);
    } catch (error) {
      eliminarComprobanteTemporal(req.file);
      if (error.status) return res.status(error.status).json({ message: error.message });
      errorServidor(res, error);
    }
  });
});

app.post('/cliente/pedidos/:id/presign-comprobante', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  const mimeType = texto(req.body?.mimeType).toLowerCase();
  if (!extensionesComprobante.has(mimeType)) {
    return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG, WEBP o un PDF de máximo 5 MB.' });
  }
  try {
    const pedido = await prisma.pedidoCliente.findFirst({
      where: { idPedido, idCliente: req.cliente.idCliente },
      select: { idPedido: true, estado: true, comprobanteRuta: true, fechaLimitePago: true },
    });
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado.' });
    if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
      return res.status(409).json({ message: 'Este pedido ya no acepta comprobantes.' });
    }
    const nombreOriginal = texto(req.body?.nombreOriginal || req.body?.filename);
    const presigned = await generarPresignedUpload({
      folder: 'comprobantes',
      mimeType,
      nombreArchivoOriginal: nombreOriginal || undefined,
    });
    res.json({
      uploadUrl: presigned.uploadUrl,
      key: presigned.key,
      fileName: presigned.fileName,
      idPedido,
      expiresIn: 900,
    });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/cliente/pedidos/:id/confirmar-comprobante', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  const key = texto(req.body?.key);
  const mimeType = texto(req.body?.mimeType).toLowerCase();
  const nombreOriginal = limpiarNombreArchivo(texto(req.body?.nombreOriginal || 'comprobante')).slice(0, 255);

  if (!key || !key.startsWith('comprobantes/')) {
    return res.status(400).json({ message: 'Key de comprobante no válida.' });
  }
  if (!extensionesComprobante.has(mimeType)) {
    return res.status(400).json({ message: 'Tipo MIME de comprobante no válido.' });
  }

  try {
    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idCliente: req.cliente.idCliente },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);

      if (await expirarPedidoBloqueado(tx, pedido)) {
        throw errorFuncional('Tu reserva expiró y los productos volvieron al inventario.', 409);
      }
      if (pedido.estado !== 'PENDIENTE_PAGO' || pedido.comprobanteRuta) {
        throw errorFuncional('Este pedido ya no acepta comprobantes.', 409);
      }

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          comprobanteRuta: key,
          comprobanteMime: mimeType,
          comprobanteNombre: nombreOriginal,
          fechaComprobante: new Date(),
          estado: 'EN_REVISION',
        },
      });

      return await obtenerPedidoSeguro(idPedido, Number(req.cliente.idCliente), tx);
    });

    res.json(actualizado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.get('/cliente/pedidos/:id/comprobante', autenticarCliente, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    const pedido = await prisma.pedidoCliente.findFirst({
      where: {
        idPedido,
        idCliente: req.cliente.idCliente,
        comprobanteRuta: { not: null },
      },
      select: {
        comprobanteRuta: true,
        comprobanteMime: true,
        comprobanteNombre: true,
      },
    });
    if (!pedido) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    const { comprobanteRuta, comprobanteMime, comprobanteNombre } = pedido;

    if (esUrlS3(comprobanteRuta)) {
      const key = extraerKeyS3(comprobanteRuta);
      const downloadUrl = await generarPresignedDownload(key, comprobanteNombre, comprobanteMime);
      if (req.query.json === 'true') {
        return res.json({ downloadUrl, key, mime: comprobanteMime, nombre: comprobanteNombre });
      }
      return res.redirect(downloadUrl);
    }

    const rutaFisica = resolverComprobantePrivado(comprobanteRuta);
    if (!rutaFisica) {
      return res.status(404).json({ message: 'Comprobante no encontrado.' });
    }
    res.type(comprobanteMime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(comprobanteNombre || 'comprobante')}`,
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
      idCliente: Number(row.cliente?.idCliente || row.idCliente),
      nombre: [row.cliente?.nombreCliente, row.cliente?.apellidoPatCliente, row.cliente?.apellidoMatCliente]
        .filter(Boolean)
        .join(' '),
      correo: row.cliente?.correoCliente || '',
      foto: row.cliente?.fotoPerfil || null,
    },
  };
}

async function obtenerPedidoAdmin(idPedido, idSuc, client = prisma) {
  const p = await client.pedidoCliente.findFirst({
    where: {
      idPedido: Number(idPedido),
      idSuc: Number(idSuc),
    },
    include: {
      cliente: true,
      empleadoRevisa: true,
      detalles: {
        include: { producto: true },
        orderBy: { idDetallePedido: 'asc' },
      },
    },
  });
  if (!p) return null;

  let configuracionTransferencia = configuracionTransferenciaPedido(p);
  if (!configuracionTransferencia) {
    try {
      const conf = await client.configuracionTransferencia.findUnique({
        where: { idSuc: p.idSuc },
      });
      configuracionTransferencia = normalizarConfiguracionTransferencia(conf);
    } catch {
      configuracionTransferencia = null;
    }
  }

  const empRevisa = p.empleadoRevisa
    ? [p.empleadoRevisa.nombreEmp, p.empleadoRevisa.apellidoPatEmp, p.empleadoRevisa.apellidoMatEmp]
        .filter(Boolean)
        .join(' ')
    : null;

  return {
    ...normalizarPedidoAdmin(p),
    empleadoRevisa: empRevisa,
    configuracionTransferencia,
    items: p.detalles.map((item) => ({
      idPro: Number(item.idPro),
      nombre: item.producto?.nombrePro || 'Producto',
      imagen: item.producto?.imagenPro || null,
      presentacion: [item.producto?.tamanoPro, item.producto?.presentacionPro].filter(Boolean).join(' · ') || null,
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
    const pedidos = await prisma.pedidoCliente.findMany({
      where: { idSuc },
      orderBy: [{ fechaPedido: 'desc' }, { idPedido: 'desc' }],
      include: {
        cliente: true,
        empleadoRevisa: true,
      },
    });
    res.json(pedidos.map(normalizarPedidoAdmin));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/admin/pedidos/:id', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  try {
    const pedido = await obtenerPedidoAdmin(idPedido, Number(req.empleado.idSuc));
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
    const pedido = await prisma.pedidoCliente.findFirst({
      where: {
        idPedido,
        idSuc: req.empleado.idSuc,
        comprobanteRuta: { not: null },
      },
      select: {
        comprobanteRuta: true,
        comprobanteMime: true,
        comprobanteNombre: true,
      },
    });
    if (!pedido) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    const { comprobanteRuta, comprobanteMime, comprobanteNombre } = pedido;

    if (esUrlS3(comprobanteRuta)) {
      const key = extraerKeyS3(comprobanteRuta);
      const downloadUrl = await generarPresignedDownload(key, comprobanteNombre, comprobanteMime);
      if (req.query.json === 'true') {
        return res.json({ downloadUrl, key, mime: comprobanteMime, nombre: comprobanteNombre });
      }
      return res.redirect(downloadUrl);
    }

    const rutaFisica = resolverComprobantePrivado(comprobanteRuta);
    if (!rutaFisica) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    res.type(comprobanteMime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(comprobanteNombre || 'comprobante')}`,
    );
    res.sendFile(rutaFisica);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/admin/pedidos/:id/rechazar', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  const motivo = texto(req.body?.motivo);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });
  if (motivo.length < 3 || motivo.length > 255)
    return res.status(400).json({ message: 'El motivo debe tener entre 3 y 255 caracteres.' });

  try {
    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc: Number(req.empleado.idSuc) },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      if (pedido.estado !== 'EN_REVISION')
        throw errorFuncional('Sólo pueden rechazarse pedidos con pago en revisión.', 409);

      await restaurarStockPedido(tx, idPedido);
      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          estado: 'RECHAZADO',
          idEmpRevisa: req.empleado.idEmp,
          fechaRevision: new Date(),
          motivoRechazo: motivo,
        },
      });

      return await obtenerPedidoAdmin(idPedido, Number(req.empleado.idSuc), tx);
    });

    res.json(actualizado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.post('/admin/pedidos/:id/aprobar', autenticar, soloAdministrador, async (req, res) => {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });

  try {
    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc: Number(req.empleado.idSuc) },
        include: {
          detalles: { orderBy: { idPro: 'asc' } },
        },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      if (pedido.estado === 'PAGADO' && pedido.idVenta) throw errorFuncional('El pedido ya fue aprobado.', 409);
      if (pedido.estado !== 'EN_REVISION')
        throw errorFuncional('Sólo pueden aprobarse pedidos con pago en revisión.', 409);
      if (!pedido.comprobanteRuta || !pedido.fechaComprobante)
        throw errorFuncional('El pedido no tiene un comprobante válido para revisar.', 409);
      if (!esUrlS3(pedido.comprobanteRuta) && !resolverComprobantePrivado(pedido.comprobanteRuta)) {
        throw errorFuncional('El archivo del comprobante no está disponible.', 409);
      }
      if (!pedido.detalles.length) throw errorFuncional('El pedido no contiene productos.', 409);

      let sumaCentavos = 0;
      for (const detalle of pedido.detalles) {
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

      const ahora = new Date();

      const venta = await tx.venta.create({
        data: {
          uuidVenta: crypto.randomUUID(),
          fechaVenta: ahora,
          horaVenta: ahora,
          total: totalPedidoCentavos / 100,
          metodoPago: 'TRANSFERENCIA',
          montoRecibido: null,
          cambio: 0.0,
          estadoVenta: 'COMPLETADA',
          idEmp: req.empleado.idEmp,
          idSuc: pedido.idSuc,
          detalles: {
            create: pedido.detalles.map((d) => ({
              idPro: d.idPro,
              cantidadDetVenta: d.cantidad,
              precioUnitarioDetVenta: Number(d.precioUnitario),
              subtotalDetVenta: Number(d.subtotal),
            })),
          },
        },
      });

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: {
          estado: 'PAGADO',
          idEmpRevisa: req.empleado.idEmp,
          fechaRevision: ahora,
          motivoRechazo: null,
          idVenta: venta.idVenta,
        },
      });

      return await obtenerPedidoAdmin(idPedido, Number(req.empleado.idSuc), tx);
    });

    res.json(actualizado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

async function cambiarEstadoOperativoPedido(req, res, estadoActual, estadoNuevo) {
  const idPedido = idValido(req.params.id);
  if (!idPedido) return res.status(400).json({ message: 'El pedido no es válido.' });

  try {
    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCliente.findFirst({
        where: { idPedido, idSuc: Number(req.empleado.idSuc) },
      });
      if (!pedido) throw errorFuncional('Pedido no encontrado.', 404);
      if (pedido.estado !== estadoActual)
        throw errorFuncional(`El pedido debe estar en estado ${estadoActual} para continuar.`, 409);

      await tx.pedidoCliente.update({
        where: { idPedido },
        data: { estado: estadoNuevo },
      });

      return await obtenerPedidoAdmin(idPedido, Number(req.empleado.idSuc), tx);
    });

    res.json(actualizado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
}

app.post('/admin/pedidos/:id/listo', autenticar, soloAdministrador, (req, res) =>
  cambiarEstadoOperativoPedido(req, res, 'PAGADO', 'LISTO'),
);
app.post('/admin/pedidos/:id/entregar', autenticar, soloAdministrador, (req, res) =>
  cambiarEstadoOperativoPedido(req, res, 'LISTO', 'ENTREGADO'),
);

function normalizarCaja(caja) {
  if (!caja) return null;
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
  const resultado = {
    ...caja,
    empleado: caja.empleado
      ? [caja.empleado.nombreEmp, caja.empleado.apellidoPatEmp, caja.empleado.apellidoMatEmp].filter(Boolean).join(' ')
      : null,
    nombreSuc: caja.sucursal?.nombreSuc || null,
  };
  for (const campo of campos) {
    resultado[campo] = resultado[campo] === null || resultado[campo] === undefined ? null : Number(resultado[campo]);
  }
  resultado.numeroVentas = Number(resultado.numeroVentas) || 0;
  return resultado;
}

async function obtenerCajaActual(idEmp) {
  const row = await prisma.sesionCaja.findFirst({
    where: {
      idEmp: Number(idEmp),
      estado: 'ABIERTA',
    },
    orderBy: { idSesionCaja: 'desc' },
    include: {
      empleado: true,
      sucursal: true,
    },
  });
  return normalizarCaja(row);
}

async function calcularResumenCaja(caja, client = prisma) {
  const [ventas, movimientos] = await Promise.all([
    client.venta.findMany({
      where: {
        idSesionCaja: caja.idSesionCaja,
        estadoVenta: 'COMPLETADA',
      },
      select: {
        total: true,
        metodoPago: true,
      },
    }),
    client.movimientoCaja.findMany({
      where: {
        idSesionCaja: caja.idSesionCaja,
      },
      select: {
        tipoMovimiento: true,
        monto: true,
      },
    }),
  ]);

  let totalVentas = 0;
  let totalEfectivo = 0;
  let totalTarjeta = 0;
  let totalTransferencia = 0;
  let numeroVentas = ventas.length;

  for (const v of ventas) {
    const tot = Number(v.total);
    totalVentas += tot;
    if (v.metodoPago === 'EFECTIVO') totalEfectivo += tot;
    else if (v.metodoPago === 'TARJETA') totalTarjeta += tot;
    else if (v.metodoPago === 'TRANSFERENCIA') totalTransferencia += tot;
  }

  let totalIngresos = 0;
  let totalRetiros = 0;

  for (const m of movimientos) {
    const monto = Number(m.monto);
    if (m.tipoMovimiento === 'INGRESO') totalIngresos += monto;
    else if (m.tipoMovimiento === 'RETIRO') totalRetiros += monto;
  }

  const fondoInicial = Number(caja.fondoInicial) || 0;
  const efectivoEsperado = fondoInicial + totalEfectivo + totalIngresos - totalRetiros;

  return {
    ...caja,
    totalVentas,
    totalEfectivo,
    totalTarjeta,
    totalTransferencia,
    numeroVentas,
    totalIngresos,
    totalRetiros,
    efectivoEsperado,
  };
}

app.post('/caja/abrir', autenticar, rolesPos, async (req, res) => {
  const uuid = uuidValido(req.body.uuidSesionCaja);
  const fondo = dineroCentavos(req.body.fondoInicial);
  if (!uuid) return res.status(400).json({ message: 'uuidSesionCaja no es válido' });
  if (fondo === null || fondo < 0) return res.status(400).json({ message: 'El fondo inicial no es válido' });

  try {
    const caja = await prisma.$transaction(async (tx) => {
      const repetida = await tx.sesionCaja.findUnique({
        where: { uuidSesionCaja: uuid },
        include: { empleado: true, sucursal: true },
      });
      if (repetida) {
        if (
          Number(repetida.idEmp) !== Number(req.empleado.idEmp) ||
          Number(repetida.idSuc) !== Number(req.empleado.idSuc)
        ) {
          throw errorFuncional('El identificador de caja ya está en uso.', 409);
        }
        return normalizarCaja(repetida);
      }

      const activa = await tx.sesionCaja.findFirst({
        where: {
          idEmp: Number(req.empleado.idEmp),
          estado: 'ABIERTA',
        },
      });
      if (activa) {
        throw errorFuncional('Ya tienes una caja abierta.', 409);
      }

      const nueva = await tx.sesionCaja.create({
        data: {
          uuidSesionCaja: uuid,
          idEmp: req.empleado.idEmp,
          idSuc: req.empleado.idSuc,
          fondoInicial: fondo / 100,
          estado: 'ABIERTA',
        },
        include: { empleado: true, sucursal: true },
      });

      return normalizarCaja(nueva);
    });

    res.status(201).json(caja);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.get('/caja/actual', autenticar, rolesPos, async (req, res) => {
  try {
    res.json({ caja: await obtenerCajaActual(req.empleado.idEmp) });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/caja/actual/resumen', autenticar, rolesPos, async (req, res) => {
  try {
    const caja = await obtenerCajaActual(req.empleado.idEmp);
    if (!caja) return res.status(404).json({ message: 'No tienes una caja abierta.' });
    res.json(await calcularResumenCaja(caja));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/caja/movimientos', autenticar, rolesPos, async (req, res) => {
  const uuid = uuidValido(req.body.uuidMovimientoCaja);
  const tipo = texto(req.body.tipoMovimiento).toUpperCase();
  const concepto = texto(req.body.concepto);
  const monto = dineroCentavos(req.body.monto);
  if (!uuid) return res.status(400).json({ message: 'uuidMovimientoCaja no es válido' });
  if (!['INGRESO', 'RETIRO'].includes(tipo))
    return res.status(400).json({ message: 'El tipo de movimiento no es válido' });
  if (monto === null || monto <= 0) return res.status(400).json({ message: 'El monto debe ser mayor que cero' });
  if (!concepto || concepto.length > 255)
    return res.status(400).json({ message: 'El concepto es obligatorio y admite hasta 255 caracteres' });

  try {
    const mov = await prisma.$transaction(async (tx) => {
      const caja = await tx.sesionCaja.findFirst({
        where: { idEmp: req.empleado.idEmp, estado: 'ABIERTA' },
      });
      if (!caja) throw errorFuncional('No tienes una caja abierta.', 409);

      const existente = await tx.movimientoCaja.findUnique({
        where: { uuidMovimientoCaja: uuid },
      });
      if (existente) {
        if (
          Number(existente.idSesionCaja) !== Number(caja.idSesionCaja) ||
          Number(existente.idEmp) !== Number(req.empleado.idEmp)
        ) {
          throw errorFuncional('El identificador del movimiento ya está en uso.', 409);
        }
        return { ...existente, monto: Number(existente.monto) };
      }

      const nuevo = await tx.movimientoCaja.create({
        data: {
          uuidMovimientoCaja: uuid,
          idSesionCaja: caja.idSesionCaja,
          idEmp: req.empleado.idEmp,
          tipoMovimiento: tipo,
          monto: monto / 100,
          concepto,
        },
      });

      return { ...nuevo, monto: Number(nuevo.monto) };
    });

    res.status(201).json(mov);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.get('/caja/movimientos', autenticar, rolesPos, async (req, res) => {
  try {
    const caja = await obtenerCajaActual(req.empleado.idEmp);
    if (!caja) return res.status(404).json({ message: 'No tienes una caja abierta.' });
    const rows = await prisma.movimientoCaja.findMany({
      where: { idSesionCaja: caja.idSesionCaja },
      orderBy: [{ fechaHora: 'desc' }, { idMovimientoCaja: 'desc' }],
    });
    res.json(rows.map((r) => ({ ...r, monto: Number(r.monto) })));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.post('/caja/cerrar', autenticar, rolesPos, async (req, res) => {
  const contado = dineroCentavos(req.body.efectivoContado);
  const observaciones = texto(req.body.observaciones);
  if (contado === null || contado < 0) return res.status(400).json({ message: 'El efectivo contado no es válido' });
  if (observaciones.length > 1000) return res.status(400).json({ message: 'Las observaciones son demasiado largas' });

  try {
    const cerrada = await prisma.$transaction(async (tx) => {
      const cajaRow = await tx.sesionCaja.findFirst({
        where: { idEmp: req.empleado.idEmp, estado: 'ABIERTA' },
        include: { empleado: true, sucursal: true },
      });
      if (!cajaRow) throw errorFuncional('No tienes una caja abierta.', 409);
      const caja = normalizarCaja(cajaRow);
      const resumen = await calcularResumenCaja(caja, tx);
      const diferencia = contado / 100 - resumen.efectivoEsperado;

      const actualizada = await tx.sesionCaja.update({
        where: { idSesionCaja: caja.idSesionCaja },
        data: {
          fechaHoraCierre: new Date(),
          totalVentas: resumen.totalVentas,
          totalEfectivo: resumen.totalEfectivo,
          totalTarjeta: resumen.totalTarjeta,
          totalTransferencia: resumen.totalTransferencia,
          totalIngresos: resumen.totalIngresos,
          totalRetiros: resumen.totalRetiros,
          efectivoEsperado: resumen.efectivoEsperado,
          efectivoContado: contado / 100,
          diferencia,
          numeroVentas: resumen.numeroVentas,
          estado: 'CERRADA',
          observaciones: observaciones || null,
        },
        include: { empleado: true, sucursal: true },
      });

      return normalizarCaja(actualizada);
    });

    res.json(cerrada);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.get('/caja/historial', autenticar, rolesPos, async (req, res) => {
  const where = {};
  if (req.empleado.cargo === 'CAJERO') {
    where.idEmp = req.empleado.idEmp;
  } else {
    where.idSuc = req.empleado.idSuc;
    if (idValido(req.query.idEmp)) {
      where.idEmp = idValido(req.query.idEmp);
    }
  }
  if (['ABIERTA', 'CERRADA'].includes(texto(req.query.estado).toUpperCase())) {
    where.estado = texto(req.query.estado).toUpperCase();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto(req.query.fecha))) {
    const fechaInicio = new Date(`${req.query.fecha}T00:00:00.000Z`);
    const fechaFin = new Date(`${req.query.fecha}T23:59:59.999Z`);
    where.fechaHoraApertura = { gte: fechaInicio, lte: fechaFin };
  }
  try {
    const rows = await prisma.sesionCaja.findMany({
      where,
      orderBy: { fechaHoraApertura: 'desc' },
      include: { empleado: true, sucursal: true },
    });
    res.json(rows.map(normalizarCaja));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/caja/:id', autenticar, rolesPos, async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ message: 'El folio de caja no es válido' });
  const where = { idSesionCaja: id };
  if (req.empleado.cargo === 'CAJERO') {
    where.idEmp = req.empleado.idEmp;
  } else {
    where.idSuc = req.empleado.idSuc;
  }
  try {
    const row = await prisma.sesionCaja.findFirst({
      where,
      include: { empleado: true, sucursal: true },
    });
    if (!row) return res.status(404).json({ message: 'Corte no encontrado' });
    res.json(normalizarCaja(row));
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/pos/productos', autenticar, rolesPos, async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { activoPro: true },
      orderBy: [{ nombrePro: 'asc' }, { idPro: 'asc' }],
      include: {
        marca: true,
        categoria: true,
      },
    });
    res.json(
      productos.map((p) => ({
        idPro: p.idPro,
        nombrePro: p.nombrePro,
        precioVentaPro: Number(p.precioVentaPro),
        existenciaPro: p.existenciaPro || 0,
        codigoQR: p.codigoQR,
        skuPro: p.skuPro,
        imagenPro: p.imagenPro,
        tamanoPro: p.tamanoPro,
        presentacionPro: p.presentacionPro,
        nombreMarca: p.marca?.nombreMarca || null,
        nombreCat: p.categoria?.nombreCat || null,
      })),
    );
  } catch (error) {
    errorServidor(res, error);
  }
});

function formatearFechaVenta(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha.toISOString().split('T')[0];
  return String(fecha).slice(0, 10);
}

function formatearHoraVenta(hora) {
  if (!hora) return null;
  if (hora instanceof Date) return hora.toISOString().slice(11, 19);
  return String(hora).slice(0, 8);
}

function dineroCentavos(value) {
  const numero = Number(value);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

async function obtenerVentaRegistrada(idVenta, empleado, client = prisma) {
  const v = await client.venta.findUnique({
    where: { idVenta: Number(idVenta) },
    include: {
      empleado: true,
      detalles: {
        include: { producto: true },
        orderBy: { idDetVenta: 'asc' },
      },
    },
  });
  if (!v) return null;

  return {
    idVenta: v.idVenta,
    uuidVenta: v.uuidVenta,
    idSesionCaja: v.idSesionCaja,
    fechaVenta: formatearFechaVenta(v.fechaVenta),
    horaVenta: formatearHoraVenta(v.horaVenta),
    total: Number(v.total),
    metodoPago: v.metodoPago,
    montoRecibido: v.montoRecibido !== null && v.montoRecibido !== undefined ? Number(v.montoRecibido) : null,
    cambio: Number(v.cambio),
    estadoVenta: v.estadoVenta,
    idEmp: v.idEmp,
    idSuc: v.idSuc,
    cajero: { idEmp: Number(v.idEmp), nombre: empleadoSeguro(empleado).nombre },
    items: v.detalles.map((d) => ({
      idPro: d.idPro,
      nombre: d.producto?.nombrePro || 'Producto',
      cantidad: d.cantidadDetVenta,
      precioUnitario: Number(d.precioUnitarioDetVenta),
      subtotal: Number(d.subtotalDetVenta),
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

  try {
    const registrada = await prisma.$transaction(async (tx) => {
      const repetida = await tx.venta.findUnique({
        where: { uuidVenta },
      });
      if (repetida) {
        if (
          Number(repetida.idEmp) !== Number(req.empleado.idEmp) ||
          Number(repetida.idSuc) !== Number(req.empleado.idSuc)
        ) {
          throw errorFuncional('El identificador de venta ya está en uso.', 409);
        }
        return await obtenerVentaRegistrada(repetida.idVenta, req.empleado, tx);
      }

      const caja = await tx.sesionCaja.findFirst({
        where: { idEmp: req.empleado.idEmp, estado: 'ABIERTA' },
      });
      if (!caja) {
        throw errorFuncional('Debes abrir caja antes de registrar ventas.', 409);
      }

      const productos = await tx.producto.findMany({
        where: { idPro: { in: ids } },
        orderBy: { idPro: 'asc' },
      });

      if (productos.length !== ids.length) {
        const encontrados = new Set(productos.map((p) => Number(p.idPro)));
        const faltante = ids.find((id) => !encontrados.has(id));
        const err = errorFuncional('Uno de los productos ya no está disponible', 404);
        err.payload = { idPro: faltante };
        throw err;
      }

      let totalCentavos = 0;
      const itemsVenta = productos.map((producto) => {
        const cantidad = cantidades.get(Number(producto.idPro));
        const disponible = Number(producto.existenciaPro) || 0;
        if (!producto.activoPro) {
          const err = errorFuncional(`${producto.nombrePro || 'El producto'} no está disponible para venta.`, 409);
          err.payload = { idPro: producto.idPro };
          throw err;
        }
        if (cantidad > disponible) {
          const err = errorFuncional(`Stock insuficiente para ${producto.nombrePro || 'el producto'}.`, 409);
          err.payload = { idPro: producto.idPro, disponible };
          throw err;
        }
        const precioCentavos = dineroCentavos(producto.precioVentaPro);
        if (precioCentavos === null || precioCentavos < 0) {
          const err = errorFuncional(`${producto.nombrePro || 'El producto'} no tiene un precio válido.`, 409);
          err.payload = { idPro: producto.idPro };
          throw err;
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
        throw errorFuncional('El efectivo recibido es insuficiente.', 400);
      }
      const cambioCentavos = metodoPago === 'EFECTIVO' ? montoRecibidoCentavos - totalCentavos : 0;
      const montoDb = metodoPago === 'EFECTIVO' ? montoRecibidoCentavos / 100 : null;

      const ahora = new Date();

      const venta = await tx.venta.create({
        data: {
          uuidVenta,
          fechaVenta: ahora,
          horaVenta: ahora,
          total: totalCentavos / 100,
          metodoPago,
          montoRecibido: montoDb,
          cambio: cambioCentavos / 100,
          estadoVenta: 'COMPLETADA',
          idEmp: req.empleado.idEmp,
          idSuc: req.empleado.idSuc,
          idSesionCaja: caja.idSesionCaja,
          detalles: {
            create: itemsVenta.map((item) => ({
              idPro: item.idPro,
              cantidadDetVenta: item.cantidad,
              precioUnitarioDetVenta: item.precioUnitario,
              subtotalDetVenta: item.subtotal,
            })),
          },
        },
      });

      for (const item of itemsVenta) {
        await tx.producto.update({
          where: { idPro: item.idPro },
          data: { existenciaPro: { decrement: item.cantidad } },
        });
      }

      return await obtenerVentaRegistrada(venta.idVenta, req.empleado, tx);
    });

    res.status(201).json(registrada);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, ...(error.payload || {}) });
    errorServidor(res, error);
  }
});

app.post('/ventas/:id/cancelar', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idVenta = idValido(req.params.id);
  const motivo = texto(req.body.motivo);
  if (!idVenta) return res.status(400).json({ message: 'El folio de venta no es válido' });
  if (motivo.length < 3 || motivo.length > 255) {
    return res.status(400).json({ message: 'El motivo debe tener entre 3 y 255 caracteres' });
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: { idVenta },
        include: {
          sesionCaja: true,
          pedidos: true,
          detalles: true,
        },
      });
      if (!venta || Number(venta.idSuc) !== Number(req.empleado.idSuc)) {
        throw errorFuncional('Venta no encontrada', 404);
      }
      if (venta.estadoVenta === 'CANCELADA') {
        throw errorFuncional('La venta ya fue cancelada.', 409);
      }
      if (venta.estadoVenta !== 'COMPLETADA') {
        throw errorFuncional('La venta no se encuentra en un estado cancelable.', 409);
      }
      if (venta.idSesionCaja && venta.sesionCaja?.estado === 'CERRADA') {
        throw errorFuncional('La venta pertenece a una caja cerrada.', 409);
      }
      if (venta.pedidos && venta.pedidos.length > 0) {
        throw errorFuncional('Las ventas de pedidos online deben gestionarse desde el pedido.', 409);
      }
      if (!venta.detalles.length) {
        throw errorFuncional('La venta no contiene detalles para restaurar.', 409);
      }

      for (const d of venta.detalles) {
        await tx.producto.update({
          where: { idPro: d.idPro },
          data: { existenciaPro: { increment: d.cantidadDetVenta } },
        });
      }

      const ahora = new Date();
      const actualizada = await tx.venta.update({
        where: { idVenta },
        data: {
          estadoVenta: 'CANCELADA',
          fechaCancelacion: ahora,
          motivoCancelacion: motivo,
          idEmpCancela: req.empleado.idEmp,
        },
      });

      return {
        idVenta: actualizada.idVenta,
        estadoVenta: actualizada.estadoVenta,
        fechaCancelacion: actualizada.fechaCancelacion?.toISOString() || null,
        motivoCancelacion: actualizada.motivoCancelacion,
        idEmpCancela: actualizada.idEmpCancela,
      };
    });

    res.json({ message: 'Venta cancelada correctamente.', venta: resultado });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    errorServidor(res, error);
  }
});

app.get('/ventas', autenticar, rolesPos, async (req, res) => {
  const where = req.empleado.cargo === 'CAJERO' ? { idEmp: req.empleado.idEmp } : { idSuc: req.empleado.idSuc };
  try {
    const ventas = await prisma.venta.findMany({
      where,
      orderBy: [{ fechaVenta: 'desc' }, { horaVenta: 'desc' }, { idVenta: 'desc' }],
      include: {
        empleado: true,
        pedidos: { select: { idPedido: true } },
      },
    });

    res.json(
      ventas.map((v) => {
        const cajeroStr = v.empleado
          ? [v.empleado.nombreEmp, v.empleado.apellidoPatEmp, v.empleado.apellidoMatEmp].filter(Boolean).join(' ')
          : null;
        const origenVenta = v.pedidos && v.pedidos.length > 0 ? 'ONLINE' : 'POS';

        return {
          idVenta: v.idVenta,
          fechaVenta: formatearFechaVenta(v.fechaVenta),
          horaVenta: formatearHoraVenta(v.horaVenta),
          total: Number(v.total),
          metodoPago: v.metodoPago,
          estadoVenta: v.estadoVenta,
          idEmp: v.idEmp,
          idSesionCaja: v.idSesionCaja,
          uuidVenta: v.uuidVenta,
          origenVenta,
          cajero: cajeroStr,
        };
      }),
    );
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/ventas/:id', autenticar, rolesPos, async (req, res) => {
  const idVenta = idValido(req.params.id);
  if (!idVenta) return res.status(400).json({ message: 'El folio de venta no es válido' });
  const where = {
    idVenta,
    ...(req.empleado.cargo === 'CAJERO' ? { idEmp: req.empleado.idEmp } : { idSuc: req.empleado.idSuc }),
  };
  try {
    const v = await prisma.venta.findFirst({
      where,
      include: {
        empleado: true,
        empleadoCancela: true,
        sucursal: true,
        pedidos: { select: { idPedido: true } },
        detalles: {
          include: { producto: true },
          orderBy: { idDetVenta: 'asc' },
        },
      },
    });
    if (!v) return res.status(404).json({ message: 'Venta no encontrada' });

    const fechaCancelacionStr = v.fechaCancelacion ? new Date(v.fechaCancelacion).toISOString() : null;
    const cajeroStr = v.empleado
      ? [v.empleado.nombreEmp, v.empleado.apellidoPatEmp, v.empleado.apellidoMatEmp].filter(Boolean).join(' ')
      : null;
    const cancStr = v.empleadoCancela
      ? [v.empleadoCancela.nombreEmp, v.empleadoCancela.apellidoPatEmp, v.empleadoCancela.apellidoMatEmp]
          .filter(Boolean)
          .join(' ')
      : null;

    const idPedido = v.pedidos && v.pedidos.length > 0 ? v.pedidos[0].idPedido : null;
    const origenVenta = idPedido ? 'ONLINE' : 'POS';

    res.json({
      idVenta: v.idVenta,
      fechaVenta: formatearFechaVenta(v.fechaVenta),
      horaVenta: formatearHoraVenta(v.horaVenta),
      total: Number(v.total),
      metodoPago: v.metodoPago,
      uuidVenta: v.uuidVenta,
      idSesionCaja: v.idSesionCaja,
      montoRecibido: v.montoRecibido !== null && v.montoRecibido !== undefined ? Number(v.montoRecibido) : null,
      cambio: Number(v.cambio),
      estadoVenta: v.estadoVenta,
      idEmp: v.idEmp,
      origenVenta,
      idPedido,
      folioPedido: idPedido ? folioPedido(idPedido) : null,
      fechaCancelacion: fechaCancelacionStr,
      motivoCancelacion: v.motivoCancelacion || null,
      idEmpCancela: v.idEmpCancela || null,
      cajero: cajeroStr,
      nombreEmpleadoCancela: cancStr,
      nombreSuc: v.sucursal?.nombreSuc || null,
      descripcionSuc: v.sucursal?.descripcionSuc || null,
      telefonoSuc: v.sucursal?.telefonoSuc || null,
      correoSuc: v.sucursal?.correoSuc || null,
      logoSuc: v.sucursal?.logoSuc || null,
      items: v.detalles.map((d) => ({
        idPro: d.idPro,
        nombre: d.producto?.nombrePro || 'Producto',
        cantidad: d.cantidadDetVenta,
        precioUnitario: Number(d.precioUnitarioDetVenta),
        subtotal: Number(d.subtotalDetVenta),
      })),
    });
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/cargos', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const cargos = await prisma.cargo.findMany({
      where: { nombreCargo: { in: ['ADMINISTRADOR', 'CAJERO'] } },
      orderBy: { nombreCargo: 'asc' },
    });
    res.json(cargos);
  } catch (error) {
    errorServidor(res, error);
  }
});

app.get('/empleados', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  try {
    const empleados = await prisma.empleado.findMany({
      orderBy: [{ nombreEmp: 'asc' }, { apellidoPatEmp: 'asc' }],
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    res.json(
      empleados.map((e) =>
        empleadoSeguro({
          ...e,
          cargo: e.cargo?.nombreCargo,
          idSuc: e.cargo?.idSuc,
          nombreSuc: e.cargo?.sucursal?.nombreSuc,
        }),
      ),
    );
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
    const cargo = await prisma.cargo.findFirst({
      where: { idCargo, nombreCargo: { in: ['ADMINISTRADOR', 'CAJERO'] } },
    });
    if (!cargo) return res.status(400).json({ message: 'El cargo no es válido' });

    const hash = password ? await bcrypt.hash(password, 12) : null;
    const empleado = await prisma.empleado.create({
      data: {
        nombreEmp: nombre,
        apellidoPatEmp: textoNullable(req.body.apellidoPat),
        apellidoMatEmp: textoNullable(req.body.apellidoMat),
        correoEmp: correo,
        contrasenaHash: hash,
        estadoEmp: true,
        telefono: textoNullable(req.body.telefono),
        fechaIngreso: req.body.fechaIngreso ? new Date(req.body.fechaIngreso) : new Date(),
        fotoPerfil: textoNullable(req.body.fotoPerfil),
        idCargo,
      },
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    res.status(201).json(
      empleadoSeguro({
        ...empleado,
        cargo: empleado.cargo?.nombreCargo,
        idSuc: empleado.cargo?.idSuc,
        nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
      }),
    );
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(' ') : String(error.meta?.target || '');
      if (target.toLowerCase().includes('idemp')) {
        return errorServidor(res, error);
      }
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }
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
    const actual = await prisma.empleado.findUnique({ where: { idEmp } });
    if (!actual) return res.status(404).json({ message: 'Empleado no encontrado' });
    const cargo = await prisma.cargo.findFirst({
      where: { idCargo, nombreCargo: { in: ['ADMINISTRADOR', 'CAJERO'] } },
    });
    if (!cargo) return res.status(400).json({ message: 'El cargo seleccionado no es válido' });

    const data = {
      nombreEmp: nombre,
      apellidoPatEmp: textoNullable(req.body.apellidoPat),
      apellidoMatEmp: textoNullable(req.body.apellidoMat),
      correoEmp: correo,
      telefono: textoNullable(req.body.telefono),
      fotoPerfil: textoNullable(req.body.fotoPerfil),
      idCargo,
    };
    if (req.body.fechaIngreso) {
      data.fechaIngreso = new Date(req.body.fechaIngreso);
    }
    if (password) {
      data.contrasenaHash = await bcrypt.hash(password, 12);
    }

    const empleado = await prisma.empleado.update({
      where: { idEmp },
      data,
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    res.json(
      empleadoSeguro({
        ...empleado,
        cargo: empleado.cargo?.nombreCargo,
        idSuc: empleado.cargo?.idSuc,
        nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
      }),
    );
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(' ') : String(error.meta?.target || '');
      if (target.toLowerCase().includes('idemp')) {
        return errorServidor(res, error);
      }
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }
    errorServidor(res, error);
  }
});

app.patch('/empleados/:id/estado', autenticar, autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  const idEmp = idValido(req.params.id);
  const estado = req.body.estado === true || req.body.estado === 1;
  if (!idEmp) return res.status(400).json({ message: 'El ID del empleado no es válido' });
  if (idEmp === req.empleado.idEmp && !estado)
    return res.status(400).json({ message: 'No puedes desactivar tu propia sesión' });
  try {
    const empleado = await prisma.empleado.update({
      where: { idEmp },
      data: { estadoEmp: estado },
      include: {
        cargo: {
          include: { sucursal: true },
        },
      },
    });
    res.json(
      empleadoSeguro({
        ...empleado,
        cargo: empleado.cargo?.nombreCargo,
        idSuc: empleado.cargo?.idSuc,
        nombreSuc: empleado.cargo?.sucursal?.nombreSuc,
      }),
    );
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Empleado no encontrado' });
    errorServidor(res, error);
  }
});

prisma
  .$connect()
  .then(() => {
    console.log('Conectado a PostgreSQL mediante Prisma Client');
  })
  .catch((error) => console.error('No se pudo conectar a PostgreSQL mediante Prisma:', error.message));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor disponible en el puerto ${port}`);
});
