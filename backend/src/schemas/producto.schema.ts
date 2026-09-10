import { z } from 'zod';

export const crearProductoSchema = z.object({
  nombre: z.string().trim().min(1, { message: 'El nombre del producto es obligatorio' }).max(150),
  precioVenta: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: 'El precio de venta debe ser un número válido mayor o igual a cero',
  }),
  costo: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: 'El costo debe ser un número válido mayor o igual a cero',
  }),
  existencia: z.union([z.number(), z.string()]).refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, {
    message: 'La existencia debe ser un número entero mayor o igual a cero',
  }),
  stockMinimo: z.union([z.number(), z.string()]).optional().nullable(),
  codigoQR: z.string().trim().max(100).optional().nullable(),
  sku: z.string().trim().max(100).optional().nullable(),
  tamano: z.string().trim().max(100).optional().nullable(),
  presentacion: z.string().trim().max(100).optional().nullable(),
  tipo: z.string().trim().max(100).optional().nullable(),
  idMarca: z.union([z.string(), z.number()], { message: 'La marca es obligatoria' }),
  idCat: z.union([z.string(), z.number()], { message: 'La categoría es obligatoria' }),
});

export const actualizarProductoSchema = crearProductoSchema.partial();
