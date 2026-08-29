import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import { VentaDetalle } from '../models/venta';
import { ImagenesService } from './imagenes.service';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly imagenes = inject(ImagenesService);

  private async crear(v: VentaDetalle): Promise<jsPDF> {
    const alto = Math.max(140, 95 + v.items.length * 9);
    const doc = new jsPDF({ unit: 'mm', format: [80, alto] });
    let y = 8;
    if (v.logoSuc) {
      try {
        const ruta = this.imagenes.resolver(v.logoSuc);
        if (ruta) {
          const response = await fetch(ruta);
          if (!response.ok) throw new Error('Logo no disponible');
          const blob = await response.blob();
          const data = await this.blobDataUrl(blob);
          const formato = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG';
          doc.addImage(data, formato, 34, 3, 12, 12);
          y = 18;
        }
      } catch {
        /* El ticket sigue siendo válido si el logo remoto no está disponible. */
      }
    }
    const centro = (texto: string, tamano = 10) => {
      doc.setFontSize(tamano);
      doc.text(texto, 40, y, { align: 'center', maxWidth: 72 });
      y += 6;
    };
    centro(v.nombreSuc || 'Tienda de abarrotes', 13);
    if (v.descripcionSuc) centro(v.descripcionSuc, 8);
    if (v.telefonoSuc) centro(`Tel. ${v.telefonoSuc}`, 8);
    if (v.correoSuc) centro(v.correoSuc, 8);
    centro('COMPROBANTE DE COMPRA', 10);
    if (v.estadoVenta === 'CANCELADA') centro('*** VENTA CANCELADA ***', 11);
    doc.setFontSize(8);
    doc.text(`Folio: ${v.idVenta}`, 4, y);
    y += 5;
    doc.text(`${v.fechaVenta} ${v.horaVenta}`, 4, y);
    y += 5;
    doc.text(`Cajero: ${v.cajero}`, 4, y, { maxWidth: 72 });
    y += 7;
    for (const item of v.items) {
      doc.text(`${item.cantidad} x ${item.nombre}`, 4, y, { maxWidth: 50 });
      doc.text(this.moneda(item.subtotal), 76, y, { align: 'right' });
      y += 5;
      doc.text(`  ${this.moneda(item.precioUnitario)} c/u`, 4, y);
      y += 4;
    }
    y += 2;
    doc.setFontSize(11);
    doc.text('TOTAL', 4, y);
    doc.text(this.moneda(v.total), 76, y, { align: 'right' });
    y += 6;
    doc.setFontSize(8);
    doc.text(`Pago: ${v.metodoPago}`, 4, y);
    y += 5;
    if (v.metodoPago === 'EFECTIVO') {
      doc.text(`Recibido: ${this.moneda(v.montoRecibido || 0)}`, 4, y);
      y += 5;
      doc.text(`Cambio: ${this.moneda(v.cambio)}`, 4, y);
      y += 5;
    }
    centro('Gracias por su compra', 9);
    centro('Comprobante no fiscal', 7);
    return doc;
  }

  async descargar(v: VentaDetalle): Promise<void> {
    const doc = await this.crear(v),
      nombre = `ticket-${v.idVenta}.pdf`;
    if (Capacitor.isNativePlatform()) {
      const data = doc.output('datauristring').split(',')[1];
      await Filesystem.writeFile({ path: nombre, data, directory: Directory.Cache });
      return;
    }
    doc.save(nombre);
  }
  async compartir(v: VentaDetalle): Promise<void> {
    const doc = await this.crear(v),
      nombre = `ticket-${v.idVenta}.pdf`;
    if (!Capacitor.isNativePlatform()) {
      doc.save(nombre);
      return;
    }
    const data = doc.output('datauristring').split(',')[1];
    const file = await Filesystem.writeFile({ path: nombre, data, directory: Directory.Cache });
    await Share.share({ title: `Comprobante ${v.idVenta}`, files: [file.uri] });
  }
  imprimir(): void {
    window.print();
  }
  private blobDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  private moneda(valor: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(valor));
  }
}
