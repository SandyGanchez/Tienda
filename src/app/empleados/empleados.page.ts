import { HttpErrorResponse } from '@angular/common/http';

import { Component, inject, OnInit } from '@angular/core';

import { ToastController } from '@ionic/angular';

import { firstValueFrom } from 'rxjs';

import { EmpleadoSesion } from '../models/auth';
import { Cargo } from '../models/cargo';

import { EmpleadoDto, EmpleadosService } from '../services/empleados.service';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-empleados',
  templateUrl: './empleados.page.html',
  styleUrls: ['./empleados.page.scss'],
  standalone: false,
})
export class EmpleadosPage implements OnInit {
  /* =========================================
     SERVICIOS
  ========================================= */

  readonly auth = inject(AuthService);

  private readonly api = inject(EmpleadosService);

  private readonly toast = inject(ToastController);

  /* =========================================
     DATOS
  ========================================= */

  empleados: EmpleadoSesion[] = [];

  cargos: Cargo[] = [];

  cargando = true;

  /* =========================================
     MODAL
  ========================================= */

  modal = false;

  guardando = false;

  editando: number | null = null;

  form: EmpleadoDto = this.vacio();

  /* =========================================
     INICIO
  ========================================= */

  ngOnInit(): void {
    void this.cargarDatos();
  }

  private async cargarDatos(): Promise<void> {
    this.cargando = true;

    try {
      const [empleados, cargos] = await Promise.all([
        firstValueFrom(this.api.listar()),

        firstValueFrom(this.api.cargos()),
      ]);

      this.empleados = empleados;

      this.cargos = cargos;
    } catch {
      await this.feedback('No fue posible cargar la información de empleados.', 'danger');
    } finally {
      this.cargando = false;
    }
  }

  /* =========================================
     ESTADÍSTICAS
  ========================================= */

  get totalEmpleados(): number {
    return this.empleados.length;
  }

  get empleadosActivos(): number {
    return this.empleados.filter((empleado) => Boolean(empleado.estadoEmp)).length;
  }

  get empleadosInactivos(): number {
    return this.empleados.filter((empleado) => !Boolean(empleado.estadoEmp)).length;
  }

  get totalCajeros(): number {
    return this.empleados.filter((empleado) => String(empleado.cargo).toUpperCase() === 'CAJERO').length;
  }

  /* =========================================
     NUEVO EMPLEADO
  ========================================= */

  nuevo(): void {
    this.editando = null;

    this.form = this.vacio();

    this.modal = true;
  }

  /* =========================================
     EDITAR
  ========================================= */

  editar(empleado: EmpleadoSesion): void {
    this.editando = empleado.idEmp;

    this.form = {
      nombre: empleado.nombreEmp || '',

      apellidoPat: empleado.apellidoPatEmp || '',

      apellidoMat: empleado.apellidoMatEmp || '',

      correo: empleado.correo,

      telefono: empleado.telefono || '',

      fechaIngreso: empleado.fechaIngreso?.slice(0, 10) || '',

      fotoPerfil: empleado.fotoPerfil || '',

      idCargo: empleado.idCargo,

      password: '',
    };

    this.modal = true;
  }

  /* =========================================
     GUARDAR
  ========================================= */

  async guardar(): Promise<void> {
    if (this.guardando) {
      return;
    }

    if (!this.form.nombre.trim() || !this.form.correo.trim() || !this.form.idCargo) {
      await this.feedback('Nombre, correo y cargo son obligatorios.', 'warning');

      return;
    }

    if (this.form.password && this.form.password.length < 8) {
      await this.feedback('La contraseña debe tener al menos 8 caracteres.', 'warning');

      return;
    }

    this.guardando = true;

    try {
      const empleado = this.editando
        ? await firstValueFrom(this.api.editar(this.editando, this.form))
        : await firstValueFrom(this.api.crear(this.form));

      this.empleados = this.upsert(empleado);

      this.modal = false;

      await this.feedback(
        this.editando ? 'Empleado actualizado correctamente.' : 'Empleado registrado correctamente.',
        'success',
      );
    } catch (error) {
      await this.feedback(
        error instanceof HttpErrorResponse && error.error?.message
          ? error.error.message
          : 'No pudimos guardar el empleado.',

        'danger',
      );
    } finally {
      this.guardando = false;
    }
  }

  /* =========================================
     ACTIVAR / DESACTIVAR
  ========================================= */

  async cambiarEstado(empleado: EmpleadoSesion): Promise<void> {
    try {
      const actualizado = await firstValueFrom(this.api.estado(empleado.idEmp, !empleado.estadoEmp));

      this.empleados = this.upsert(actualizado);

      await this.feedback(
        actualizado.estadoEmp ? 'Empleado activado.' : 'Empleado desactivado.',

        'success',
      );
    } catch {
      await this.feedback('No pudimos cambiar el estado.', 'danger');
    }
  }

  /* =========================================
     UPSERT LOCAL
  ========================================= */

  private upsert(empleado: EmpleadoSesion): EmpleadoSesion[] {
    const existe = this.empleados.some((item) => item.idEmp === empleado.idEmp);

    if (existe) {
      return this.empleados.map((item) => (item.idEmp === empleado.idEmp ? empleado : item));
    }

    return [...this.empleados, empleado];
  }

  /* =========================================
     FORM VACÍO
  ========================================= */

  private vacio(): EmpleadoDto {
    return {
      nombre: '',

      apellidoPat: '',

      apellidoMat: '',

      correo: '',

      telefono: '',

      fechaIngreso: '',

      fotoPerfil: '',

      idCargo: null,

      password: '',
    };
  }

  /* =========================================
     TOAST
  ========================================= */

  private async feedback(message: string, color: 'success' | 'danger' | 'warning'): Promise<void> {
    const toast = await this.toast.create({
      message,

      color,

      duration: 3000,

      position: 'top',
    });

    await toast.present();
  }
}
