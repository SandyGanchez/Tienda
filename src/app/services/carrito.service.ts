import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { ItemCarrito, ProductoParaCarrito } from '../models/carrito';

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly clave = 'tienda.cliente.carrito';
  private readonly subject = new BehaviorSubject<ItemCarrito[]>(this.leer());
  readonly items$ = this.subject.asObservable();
  readonly cantidadTotal$ = this.items$.pipe(map((items) => items.reduce((total, item) => total + item.cantidad, 0)));
  readonly totalMostrado$ = this.items$.pipe(
    map((items) => items.reduce((total, item) => total + item.precioMostrado * item.cantidad, 0)),
  );

  get items(): ItemCarrito[] {
    return this.subject.value;
  }
  get cantidadTotal(): number {
    return this.items.reduce((total, item) => total + item.cantidad, 0);
  }
  get totalMostrado(): number {
    return this.items.reduce((total, item) => total + item.precioMostrado * item.cantidad, 0);
  }

  agregar(producto: ProductoParaCarrito): boolean {
    const stock = Math.max(0, Math.trunc(Number(producto.existenciaPro ?? 0)));
    if (!Number.isFinite(stock) || stock <= 0) return false;
    const precio = Number(producto.precioVentaPro);
    if (!Number.isFinite(precio) || precio < 0) return false;

    const existente = this.items.find((item) => item.idPro === Number(producto.idPro));
    if (existente && existente.cantidad >= stock) return false;
    const presentacion = [producto.tamanoPro, producto.presentacionPro].filter(Boolean).join(' · ') || null;
    const actualizados = existente
      ? this.items.map((item) =>
          item.idPro === existente.idPro
            ? {
                ...item,
                cantidad: item.cantidad + 1,
                precioMostrado: precio,
                stockConocido: stock,
                imagen: producto.imagenPro,
                presentacion,
              }
            : item,
        )
      : [
          ...this.items,
          {
            idPro: Number(producto.idPro),
            nombre: producto.nombrePro,
            precioMostrado: precio,
            cantidad: 1,
            imagen: producto.imagenPro,
            stockConocido: stock,
            presentacion,
          },
        ];
    this.actualizar(actualizados);
    return true;
  }

  incrementar(idPro: number): boolean {
    const item = this.items.find((actual) => actual.idPro === idPro);
    if (!item || item.cantidad >= item.stockConocido) return false;
    this.actualizar(
      this.items.map((actual) => (actual.idPro === idPro ? { ...actual, cantidad: actual.cantidad + 1 } : actual)),
    );
    return true;
  }

  decrementar(idPro: number): void {
    const item = this.items.find((actual) => actual.idPro === idPro);
    if (!item || item.cantidad <= 1) return;
    this.actualizar(
      this.items.map((actual) => (actual.idPro === idPro ? { ...actual, cantidad: actual.cantidad - 1 } : actual)),
    );
  }

  eliminar(idPro: number): void {
    this.actualizar(this.items.filter((item) => item.idPro !== idPro));
  }
  vaciar(): void {
    this.actualizar([]);
  }

  actualizarDisponibilidad(
    productos: Array<{ idPro: number; existenciaPro: number | null; precioVentaPro: number }>,
  ): void {
    const disponibles = new Map(productos.map((producto) => [Number(producto.idPro), producto]));
    const actualizados = this.items.reduce<ItemCarrito[]>((resultado, item) => {
      const producto = disponibles.get(item.idPro);
      if (!producto) return resultado;
      const stock = Math.max(0, Math.trunc(Number(producto.existenciaPro ?? 0)));
      if (!stock) return resultado;
      const precio = Number(producto.precioVentaPro);
      resultado.push({
        ...item,
        stockConocido: stock,
        cantidad: Math.min(item.cantidad, stock),
        precioMostrado: Number.isFinite(precio) && precio >= 0 ? precio : item.precioMostrado,
      });
      return resultado;
    }, []);
    this.actualizar(actualizados);
  }

  private actualizar(items: ItemCarrito[]): void {
    localStorage.setItem(this.clave, JSON.stringify(items));
    this.subject.next(items);
  }

  private leer(): ItemCarrito[] {
    try {
      const guardado = JSON.parse(localStorage.getItem(this.clave) || '[]') as unknown;
      if (!Array.isArray(guardado)) return [];
      return guardado
        .filter(this.esItemValido)
        .map((item) => ({ ...item, cantidad: Math.min(item.cantidad, item.stockConocido) }));
    } catch {
      return [];
    }
  }

  private esItemValido(valor: unknown): valor is ItemCarrito {
    if (!valor || typeof valor !== 'object') return false;
    const item = valor as Partial<ItemCarrito>;
    return (
      typeof item.idPro === 'number' &&
      Number.isInteger(item.idPro) &&
      typeof item.nombre === 'string' &&
      typeof item.precioMostrado === 'number' &&
      Number.isFinite(item.precioMostrado) &&
      item.precioMostrado >= 0 &&
      typeof item.cantidad === 'number' &&
      Number.isInteger(item.cantidad) &&
      item.cantidad > 0 &&
      typeof item.stockConocido === 'number' &&
      Number.isInteger(item.stockConocido) &&
      item.stockConocido > 0 &&
      item.cantidad <= item.stockConocido
    );
  }
}
