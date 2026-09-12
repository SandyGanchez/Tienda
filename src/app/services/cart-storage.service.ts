import { Injectable } from '@angular/core';
import { ItemCarrito } from '../models/carrito';

/**
 * =========================================================================
 * Single Responsibility Principle (SRP) - Cart Storage Service
 * =========================================================================
 * Responsabilidad única: Persistencia, serialización, deserialización y
 * saneamiento de los ítems del carrito de compras en el almacenamiento local.
 */
@Injectable({
  providedIn: 'root',
})
export class CartStorageService {
  private readonly storageKey = 'tienda.cliente.carrito';

  leer(): ItemCarrito[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(this.esItemValido)
        .map((item) => ({ ...item, cantidad: Math.min(item.cantidad, item.stockConocido) }));
    } catch {
      return [];
    }
  }

  guardar(items: ItemCarrito[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Ignorar errores de quota en almacenamiento local
    }
  }

  private esItemValido(valor: unknown): valor is ItemCarrito {
    if (!valor || typeof valor !== 'object') return false;
    const item = valor as Partial<ItemCarrito>;
    return (
      typeof item.id === 'string' &&
      Boolean(item.id) &&
      typeof item.nombre === 'string' &&
      typeof item.precioMostrado === 'number' &&
      Number.isFinite(item.precioMostrado) &&
      item.precioMostrado >= 0 &&
      typeof item.cantidad === 'number' &&
      Number.isInteger(item.cantidad) &&
      item.cantidad > 0 &&
      typeof item.stockConocido === 'number' &&
      Number.isInteger(item.stockConocido) &&
      item.stockConocido > 0
    );
  }

  limpiar(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }
}
