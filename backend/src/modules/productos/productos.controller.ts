import fs from 'fs';
import { Request, Response } from 'express';
import { productosService } from './productos.service';
import { idValido, texto } from '../../utils/formatters';

export class ProductosController {
  async listarAdmin(req: Request, res: Response): Promise<void> {
    const productos = await productosService.listarAdmin();
      res.json(productos);
  }

  async listarPos(req: Request, res: Response): Promise<void> {
    const productos = await productosService.listarPos();
      res.json(productos);
  }

  async listarPublico(req: Request, res: Response): Promise<void> {
    const productos = await productosService.listarPublico();
      res.json(productos);
  }

  async buscarPorQR(req: Request, res: Response): Promise<void> {
    const codigo = texto(req.params.codigo);
      const producto = await productosService.buscarPorQR(codigo);
      if (!producto) {
              res.status(404).json({ message: 'Producto no encontrado' });
              return;
            }
      res.json(producto);
  }

  async consultarExterno(req: Request, res: Response): Promise<void> {
    const codigo = texto(req.params.codigo);
      const info = await productosService.consultarExterno(codigo);
      res.json(info);
  }

  async crear(req: Request, res: Response): Promise<void> {
    const nuevo = await productosService.crear(req.body);
      res.status(201).json(nuevo);
  }

  async subirImagenLocal(req: Request, res: Response): Promise<void> {
    const idPro = idValido(req.params.id);
    if (!idPro) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      res.status(400).json({ message: 'El ID del producto no es válido' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Selecciona una imagen para subir' });
      return;
    }

    try {
      const producto = await productosService.actualizarImagenLocal(idPro, req.file.filename, req.file.path);
      res.json(producto);
    } catch (error: any) {
      if (error?.status === 404) {
        res.status(404).json({ message: 'Producto no encontrado' });
        return;
      }
      throw error;
    }
  }

  async presignImagen(req: Request, res: Response): Promise<void> {
    const idPro = idValido(req.params.id);
    if (!idPro) {
      res.status(400).json({ message: 'El ID del producto no es válido' });
      return;
    }
    const mimeType = texto(req.body?.mimeType).toLowerCase();
    const extension = texto(req.body?.extension).toLowerCase();
    if (!mimeType) {
      res.status(400).json({ message: 'El mimeType es obligatorio' });
      return;
    }

    const data = await productosService.presignImagen(idPro, mimeType, extension);
      res.json(data);
  }

  async confirmarImagen(req: Request, res: Response): Promise<void> {
    const idPro = idValido(req.params.id);
    if (!idPro) {
      res.status(400).json({ message: 'El ID del producto no es válido' });
      return;
    }
    const key = texto(req.body?.key) || texto(req.body?.publicUrl);
    if (!key) {
      res.status(400).json({ message: 'La clave o URL de la imagen es obligatoria' });
      return;
    }

    const producto = await productosService.confirmarImagen(idPro, key);
      res.json(producto);
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    const idPro = idValido(req.params.id);
    if (!idPro) {
      res.status(400).json({ message: 'El ID del producto no es válido' });
      return;
    }

    const producto = await productosService.actualizar(idPro, req.body);
      res.json(producto);
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    const idPro = idValido(req.params.id);
    if (!idPro) {
      res.status(400).json({ message: 'El ID del producto no es válido' });
      return;
    }

    const resultado = await productosService.eliminar(idPro);
      res.json(resultado);
  }
}

export const productosController = new ProductosController();
