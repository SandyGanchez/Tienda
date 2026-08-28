import {HttpErrorResponse} from '@angular/common/http';
import {inject,Injectable} from '@angular/core';
import {Network} from '@capacitor/network';
import {BehaviorSubject,firstValueFrom} from 'rxjs';
import {CrearVentaDto} from '../models/venta';
import {AuthService} from './auth.service';
import {CajaService} from './caja.service';
import {SqliteService} from './sqlite.service';
import {VentaService} from './venta.service';
export interface EstadoSync{conectado:boolean;pendientes:number;conflictos:number;sincronizando:boolean;}
@Injectable({providedIn:'root'})
export class SyncService{
 private sqlite=inject(SqliteService);private cajas=inject(CajaService);private ventas=inject(VentaService);private auth=inject(AuthService);private subject=new BehaviorSubject<EstadoSync>({conectado:true,pendientes:0,conflictos:0,sincronizando:false});readonly estado$=this.subject.asObservable();private ejecutando=false;
 constructor(){if(this.sqlite.disponible){void this.iniciar();}}
 private async iniciar():Promise<void>{await this.sqlite.initDB();const estado=await Network.getStatus();this.actualizar({conectado:estado.connected});await this.refrescarContadores();await Network.addListener('networkStatusChange',s=>{this.actualizar({conectado:s.connected});if(s.connected)void this.sincronizarPendientes();});if(estado.connected)void this.sincronizarPendientes();}
 async obtenerPendientes(){return this.sqlite.pendientesSync();}async obtenerConflictos(){return(await this.sqlite.pendientesSync()).filter(x=>x.estado==='CONFLICTO');}async reintentar():Promise<void>{await this.sincronizarPendientes();}estadoConexion():EstadoSync{return this.subject.value;}
  async sincronizarPendientes():Promise<void>{if(this.ejecutando||!this.sqlite.disponible||!this.subject.value.conectado||!this.auth.token)return;this.ejecutando=true;this.actualizar({sincronizando:true});try{const cola=await this.sqlite.pendientesSync();for(const op of cola.filter(x=>x.estado==='PENDIENTE')){try{const p=JSON.parse(op.payload);if(op.tipo==='APERTURA')await firstValueFrom(this.cajas.abrir(p.uuidSesionCaja,p.fondoInicial));else if(op.tipo==='MOVIMIENTO')await firstValueFrom(this.cajas.registrarMovimiento(p.uuidMovimientoCaja,p.tipoMovimiento,p.monto,p.concepto));else if(op.tipo==='VENTA')await firstValueFrom(this.ventas.cobrar(p as CrearVentaDto));else if(op.tipo==='CIERRE'){if((await this.sqlite.pendientesSync()).some(x=>x.id<op.id&&x.estado!=='SINCRONIZADA'))break;const caja=await firstValueFrom(this.cajas.cerrar(p.efectivoContado,p.observaciones));await this.sqlite.marcarCajaCerrada(p.uuidSesionCaja,'SINCRONIZADA',caja);}await this.sqlite.actualizarCola(op.uuid,'SINCRONIZADA');await this.sqlite.marcarEntidadSync(op.tipo,op.uuid,'SINCRONIZADA');}catch(e){if(e instanceof HttpErrorResponse&&e.status===401)break;const conflicto=e instanceof HttpErrorResponse&&e.status===409&&op.tipo==='VENTA',mensaje=e instanceof HttpErrorResponse?e.error?.message||e.message:String(e);await this.sqlite.actualizarCola(op.uuid,conflicto?'CONFLICTO':'PENDIENTE',mensaje);await this.sqlite.marcarEntidadSync(op.tipo,op.uuid,conflicto?'CONFLICTO':'PENDIENTE',mensaje);if(conflicto)continue;break;}}if(!(await this.sqlite.pendientesSync()).some(x=>x.estado==='PENDIENTE'))await this.refrescarCatalogo();}finally{this.ejecutando=false;this.actualizar({sincronizando:false});await this.refrescarContadores();}}
  private async refrescarCatalogo():Promise<void>{try{const productos=await firstValueFrom(this.ventas.productos());for(const p of productos)await this.sqlite.guardarProductoPos(p);}catch{/* Se conserva el catálogo local. */}}
 private async refrescarContadores():Promise<void>{const p=await this.sqlite.pendientesSync();this.actualizar({pendientes:p.filter(x=>x.estado==='PENDIENTE').length,conflictos:p.filter(x=>x.estado==='CONFLICTO').length});}private actualizar(p:Partial<EstadoSync>):void{this.subject.next({...this.subject.value,...p});}
}
