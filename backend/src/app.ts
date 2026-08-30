import express from 'express';
import cors from 'cors';
import { baseUploadsDir } from './middlewares/upload.middleware';
import { globalErrorHandler, notFoundHandler } from './middlewares/error.middleware';

// Routes
import { authRoutes } from './modules/auth/auth.routes';
import { productosRoutes } from './modules/productos/productos.routes';
import { catalogosRoutes } from './modules/catalogos/catalogos.routes';
import { empleadosRoutes } from './modules/empleados/empleados.routes';
import { cajaRoutes } from './modules/caja/caja.routes';
import { ventasRoutes } from './modules/ventas/ventas.routes';
import { adminPedidosRoutes, clientePedidosRoutes } from './modules/pedidos/pedidos.routes';
import { adminConfiguracionRoutes, clienteConfiguracionRoutes } from './modules/configuracion/configuracion.routes';
import { uploadsRoutes } from './modules/uploads/uploads.routes';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos locales de uploads
app.use('/uploads', express.static(baseUploadsDir));

// Rutas de la API
app.use('/auth', authRoutes);
app.use('/', productosRoutes);
app.use('/', catalogosRoutes);
app.use('/empleados', empleadosRoutes);
app.use('/caja', cajaRoutes);
app.use('/ventas', ventasRoutes);
app.use('/cliente/pedidos', clientePedidosRoutes);
app.use('/admin/pedidos', adminPedidosRoutes);
app.use('/configuracion', adminConfiguracionRoutes);
app.use('/cliente', clienteConfiguracionRoutes);
app.use('/uploads', uploadsRoutes);

// Manejadores de 404 y errores globales
app.use(notFoundHandler);
app.use(globalErrorHandler);

export { app };
