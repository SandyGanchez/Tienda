import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { firstValueFrom } from 'rxjs';
import { Categoria } from '../models/categoria';
import { Marca } from '../models/marca';
import { CrearProductoDto, Producto } from '../models/productos';
import { Sucursal } from '../models/sucursal';
import { CatalogoDto, CatalogosService } from '../services/catalogos.service';
import { ProductoPublico, ProductosService } from '../services/productos.service';
import { SqliteService } from '../services/sqlite.service';
import { SucursalService } from '../services/sucursal.service';
import { AuthService } from '../services/auth.service';
import { ScanFeedbackService } from '../services/scan-feedback.service';

type Seccion = 'inicio' | 'productos' | 'categorias' | 'marcas' | 'configuracion';
type ModoProducto = 'crear' | 'editar';
type TipoCatalogo = 'marca' | 'categoria';

interface FormularioProducto {
  nombre: string;
  precio: number | null;
  costo: number | null;
  existencia: number | null;
  stockMinimo: number | null;
  tamano: string;
  presentacion: string;
  tipo: string;
  codigoQR: string;
  sku: string;
  imagen: string;
  idMarca: number | null;
  idCat: number | null;
}

interface DatosProductoFormulario {
  nombre: string;
  precio: number;
  costo: number | null;
  existencia: number;
  stockMinimo: number | null;
  tamano: string;
  presentacion: string;
  tipo: string;
  codigoQR: string;
  sku: string;
  imagen: string;
  idMarca: number;
  idCat: number;
}

interface FormularioCatalogo {
  nombre: string;
  descripcion: string;
}

type CampoProducto = 'nombre' | 'precio' | 'costo' | 'existencia' | 'stockMinimo' | 'idMarca' | 'idCat';
type ErroresProducto = Partial<Record<CampoProducto, string>>;
type TipoFeedback = 'success' | 'danger' | 'warning' | 'primary';
type FiltroStock = 'todos' | 'disponible' | 'bajo' | 'sin-stock';
type EstadoStock = Exclude<FiltroStock, 'todos'>;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  seccion: Seccion = 'inicio';
  productos: Producto[] = [];
  marcas: Marca[] = [];
  categorias: Categoria[] = [];
  busquedaProducto = '';
  filtroCategoria = 0;
  filtroMarca = 0;
  filtroStock: FiltroStock = 'todos';
  busquedaCategoria = '';
  busquedaMarca = '';
  cargandoProductos = true;

  mostrarModalProducto = false;
  mostrarOpcionesAgregar = false;
  modoProducto: ModoProducto = 'crear';
  productoEditandoId: number | null = null;
  formProducto: FormularioProducto = this.formularioProductoVacio();

  mostrarModalCatalogo = false;
  tipoCatalogo: TipoCatalogo = 'marca';
  catalogoEditandoId: number | null = null;
  formCatalogo: FormularioCatalogo = { nombre: '', descripcion: '' };
  guardandoProducto = false;
  buscandoProducto = false;
  mensajeBusqueda = '';
  sugerenciaPublica: ProductoPublico | null = null;
  productoEncontrado: Producto | null = null;
  codigosDetectados: string[] = [];
  mostrarSelectorCodigos = false;
  leyendoCodigo = false;
  private feedbackCamaraPendiente = false;
  erroresProducto: ErroresProducto = {};
  fotoProductoPendiente: Blob | null = null;
  nombreFotoPendiente = '';
  previewFotoPendiente: string | null = null;
  guardandoCatalogo = false;
  catalogoDesdeProducto = false;
  sucursales: Sucursal[] = [];
  sucursalActual: Sucursal | null = null;
  cargandoSucursal = true;

  private readonly formatosComerciales = [
    BarcodeFormat.Ean13,
    BarcodeFormat.Ean8,
    BarcodeFormat.UpcA,
    BarcodeFormat.UpcE,
    BarcodeFormat.Code128,
    BarcodeFormat.QrCode,
  ];
  private readonly api = inject(ProductosService);
  private readonly catalogosApi = inject(CatalogosService);
  private readonly sqlite = inject(SqliteService);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly sucursalApi = inject(SucursalService);
  private readonly route = inject(ActivatedRoute);
  private readonly scanFeedback = inject(ScanFeedbackService);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((parametros) => {
      const seccion = parametros.get('seccion');
      if (seccion && ['inicio', 'productos', 'categorias', 'marcas', 'configuracion'].includes(seccion)) {
        this.seccion = seccion as Seccion;
      }
    });
    this.cargarProductos();
    this.cargarMarcas();
    this.cargarCategorias();
    this.cargarSucursales();
  }

  get tituloSeccion(): string {
    const titulos: Record<Seccion, string> = {
      inicio: 'Administración',
      productos: 'Productos',
      categorias: 'Categorías',
      marcas: 'Marcas',
      configuracion: 'Configuración',
    };
    return titulos[this.seccion];
  }

  get productosFiltrados(): Producto[] {
    const termino = this.busquedaProducto.trim().toLowerCase();
    return this.productos.filter((producto) => {
      const coincideTexto =
        !termino ||
        [producto.nombrePro, producto.codigoQR, producto.skuPro].some((valor) =>
          (valor || '').toLowerCase().includes(termino),
        );
      const coincideCategoria = !this.filtroCategoria || Number(producto.idCat) === this.filtroCategoria;
      const coincideMarca = !this.filtroMarca || Number(producto.idMarca) === this.filtroMarca;
      const coincideStock = this.filtroStock === 'todos' || this.estadoStock(producto) === this.filtroStock;
      return coincideTexto && coincideCategoria && coincideMarca && coincideStock;
    });
  }

  get categoriasFiltradas(): Categoria[] {
    const termino = this.busquedaCategoria.trim().toLowerCase();
    return this.categorias.filter(
      (categoria) =>
        !termino || `${categoria.nombreCat || ''} ${categoria.descripCat || ''}`.toLowerCase().includes(termino),
    );
  }

  get marcasFiltradas(): Marca[] {
    const termino = this.busquedaMarca.trim().toLowerCase();
    return this.marcas.filter(
      (marca) => !termino || `${marca.nombreMarca || ''} ${marca.descripMarca || ''}`.toLowerCase().includes(termino),
    );
  }

  get totalDisponibles(): number {
    return this.productos.filter((p) => this.estadoStock(p) === 'disponible').length;
  }
  get totalStockBajoInventario(): number {
    return this.productos.filter((p) => this.estadoStock(p) === 'bajo').length;
  }
  get totalSinStock(): number {
    return this.productos.filter((p) => this.estadoStock(p) === 'sin-stock').length;
  }
  get hayFiltrosProductos(): boolean {
    return Boolean(
      this.busquedaProducto.trim() || this.filtroCategoria || this.filtroMarca || this.filtroStock !== 'todos',
    );
  }

  get gananciaUnidad(): number | null {
    if (this.formProducto.precio === null || this.formProducto.costo === null) return null;
    return Number(this.formProducto.precio) - Number(this.formProducto.costo);
  }

  get margenSobrePrecio(): number | null {
    if (this.gananciaUnidad === null || !this.formProducto.precio) return null;
    return (this.gananciaUnidad / Number(this.formProducto.precio)) * 100;
  }

  get totalStockBajo(): number {
    return this.productos.filter(
      (producto) =>
        producto.stockMinimoPro !== null &&
        producto.existenciaPro !== null &&
        producto.existenciaPro <= producto.stockMinimoPro,
    ).length;
  }

  get productosStockBajo(): Producto[] {
    return this.productos
      .filter(
        (producto) =>
          producto.stockMinimoPro !== null &&
          producto.existenciaPro !== null &&
          producto.existenciaPro <= producto.stockMinimoPro,
      )
      .slice(0, 6);
  }

  get nombreTienda(): string {
    return this.sucursalActual?.nombreSuc?.trim() || 'Mi tienda';
  }

  seleccionarSeccion(seccion: Seccion): void {
    this.seccion = seccion;
  }

  volverAdministracion(): void {
    this.seccion = 'inicio';
  }

  cargarProductos(): void {
    this.cargandoProductos = true;
    this.api.getProductos().subscribe({
      next: (productos) => {
        this.productos = this.productosUnicos(productos);
        this.cargandoProductos = false;
      },
      error: (error: unknown) => {
        console.error('No se pudieron cargar los productos', error);
        this.cargandoProductos = false;
      },
    });
  }

  estadoStock(producto: Producto): EstadoStock {
    const existencia = Number(producto.existenciaPro ?? 0);
    if (existencia <= 0) return 'sin-stock';
    if (producto.stockMinimoPro !== null && existencia <= Number(producto.stockMinimoPro)) return 'bajo';
    return 'disponible';
  }

  etiquetaStock(producto: Producto): string {
    return { disponible: 'Disponible', bajo: 'Stock bajo', 'sin-stock': 'Sin stock' }[this.estadoStock(producto)];
  }

  limpiarFiltrosProductos(): void {
    this.busquedaProducto = '';
    this.filtroCategoria = 0;
    this.filtroMarca = 0;
    this.filtroStock = 'todos';
  }

  cargarMarcas(): void {
    this.catalogosApi.getMarcas().subscribe({
      next: (marcas) => (this.marcas = marcas),
      error: (error: unknown) => console.error('No se pudieron cargar las marcas', error),
    });
  }

  cargarCategorias(): void {
    this.catalogosApi.getCategorias().subscribe({
      next: (categorias) => (this.categorias = categorias),
      error: (error: unknown) => console.error('No se pudieron cargar las categorías', error),
    });
  }

  cargarSucursales(): void {
    this.cargandoSucursal = true;
    this.sucursalApi.obtenerSucursales().subscribe({
      next: (sucursales) => {
        this.sucursales = sucursales;
        this.sucursalActual = sucursales.length === 1 ? sucursales[0] : null;
        this.cargandoSucursal = false;
      },
      error: (error: unknown) => {
        console.error('No se pudo cargar la configuración de tienda', error);
        this.cargandoSucursal = false;
      },
    });
  }

  seleccionarSucursal(sucursal: Sucursal): void {
    this.sucursalActual = sucursal;
  }

  actualizarSucursal(sucursal: Sucursal): void {
    this.sucursales = this.reemplazarPorId(this.sucursales, sucursal, 'idSuc');
    this.sucursalActual = sucursal;
  }

  resolverLogoTienda(): string | null {
    return this.sucursalApi.resolverImagen(this.sucursalActual?.logoSuc);
  }

  abrirNuevoProducto(): void {
    this.modoProducto = 'crear';
    this.productoEditandoId = null;
    this.formProducto = this.formularioProductoVacio();
    this.reiniciarFotoPendiente();
    this.erroresProducto = {};
    this.limpiarBusquedaPublica();
    this.mostrarOpcionesAgregar = false;
    this.mostrarModalProducto = true;
  }

  abrirOpcionesAgregar(): void {
    this.mostrarOpcionesAgregar = true;
  }

  editarProducto(producto: Producto): void {
    this.modoProducto = 'editar';
    this.productoEditandoId = producto.idPro;
    this.formProducto = {
      nombre: producto.nombrePro || '',
      precio: producto.precioVentaPro ?? null,
      costo: producto.costoPro ?? null,
      existencia: producto.existenciaPro ?? null,
      stockMinimo: producto.stockMinimoPro ?? null,
      tamano: producto.tamanoPro || '',
      presentacion: producto.presentacionPro || '',
      tipo: producto.tipoPro || '',
      codigoQR: producto.codigoQR || '',
      sku: producto.skuPro || '',
      imagen: producto.imagenPro || '',
      idMarca: producto.idMarca,
      idCat: producto.idCat,
    };
    this.reiniciarFotoPendiente();
    this.erroresProducto = {};
    this.limpiarBusquedaPublica();
    this.mostrarModalProducto = true;
  }

  cancelarModalProducto(): void {
    this.mostrarModalProducto = false;
  }

  async guardarDesdeModal(agregarOtro = false): Promise<void> {
    if (this.guardandoProducto) return;
    const datos = this.datosFormularioProducto();
    if (!datos) return;

    const dto = this.mapearProductoDto(datos);
    this.guardandoProducto = true;
    try {
      let guardadoRemoto: Producto;
      try {
        guardadoRemoto =
          this.modoProducto === 'editar' && this.productoEditandoId !== null
            ? await firstValueFrom(this.api.updateProducto(this.productoEditandoId, dto))
            : await firstValueFrom(this.api.addProducto(dto));
      } catch (error: unknown) {
        await this.mostrarFeedback(this.mensajeErrorHttp(error, 'No pudimos guardar el producto.'), 'danger');
        return;
      }

      let productoFinal = guardadoRemoto;
      let fotoFallo = false;
      if (this.fotoProductoPendiente) {
        try {
          productoFinal = await firstValueFrom(
            this.api.subirImagen(guardadoRemoto.idPro, this.fotoProductoPendiente, this.nombreFotoPendiente),
          );
        } catch (error: unknown) {
          fotoFallo = true;
          console.error('Producto guardado, pero falló la fotografía', error);
        }
      }

      this.actualizarProductoEnLista(productoFinal);
      let copiaLocalFallo = false;
      try {
        await this.sqlite.guardarProducto(productoFinal);
      } catch (error: unknown) {
        copiaLocalFallo = true;
        console.error('Producto guardado en MySQL, pero falló SQLite', error);
      }

      if (agregarOtro && this.modoProducto === 'crear') {
        this.formProducto = this.formularioProductoVacio();
        this.reiniciarFotoPendiente();
        this.limpiarBusquedaPublica();
      } else {
        this.mostrarModalProducto = false;
        this.reiniciarFotoPendiente();
      }

      if (fotoFallo) {
        await this.mostrarFeedback('Producto guardado, pero no pudimos subir la fotografía.', 'warning');
      } else if (copiaLocalFallo) {
        await this.mostrarFeedback('Producto guardado, pero no fue posible actualizar la copia local.', 'warning');
      } else {
        const mensaje = agregarOtro
          ? 'Producto guardado. Puedes agregar el siguiente.'
          : this.modoProducto === 'editar'
            ? 'Producto actualizado correctamente.'
            : 'Producto guardado correctamente.';
        await this.mostrarFeedback(mensaje, 'success');
      }
    } finally {
      this.guardandoProducto = false;
    }
  }

  async buscarInformacionCodigo(): Promise<void> {
    await this.procesarCodigo(this.formProducto.codigoQR);
  }

  async procesarCodigo(valor: string): Promise<void> {
    const codigo = valor.trim();
    this.limpiarBusquedaPublica();
    this.productoEncontrado = null;
    if (!codigo) {
      this.mensajeBusqueda = 'Escribe un código de barras para buscar.';
      return;
    }
    this.formProducto.codigoQR = codigo;
    this.buscandoProducto = true;
    try {
      const local = await this.sqlite.buscarPorQR(codigo);
      if (local) {
        this.productoEncontrado = local;
        this.mensajeBusqueda = 'Este producto ya está registrado.';
        return;
      }
      const propio = await firstValueFrom(this.api.getByQR(codigo));
      if (propio) {
        await this.sqlite.guardarProducto(propio);
        this.productoEncontrado = propio;
        this.mensajeBusqueda = 'Este producto ya está registrado.';
        return;
      }
      const sugerencia = await firstValueFrom(this.api.buscarInformacionPublica(codigo));
      if (!sugerencia.encontrado) {
        this.mensajeBusqueda = 'No encontramos información para ese código. Puedes continuar manualmente.';
        return;
      }
      this.sugerenciaPublica = sugerencia;
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        this.mensajeBusqueda = 'No fue posible conectar con el servidor. Puedes continuar manualmente.';
      } else {
        this.mensajeBusqueda =
          error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
            ? error.error.message
            : 'No fue posible completar la búsqueda. Puedes continuar manualmente.';
      }
    } finally {
      this.buscandoProducto = false;
    }
  }

  async escanearCodigoEnVivo(): Promise<void> {
    if (this.leyendoCodigo || this.buscandoProducto) return;
    this.leyendoCodigo = true;
    await this.scanFeedback.preparar();
    try {
      const soporte = await BarcodeScanner.isSupported();
      if (!soporte.supported) {
        this.mensajeBusqueda = 'La cámara no está disponible. Puedes escribir el código manualmente.';
        return;
      }
      const permisos = await BarcodeScanner.checkPermissions();
      const estado = permisos.camera === 'granted' ? permisos : await BarcodeScanner.requestPermissions();
      if (estado.camera !== 'granted') {
        this.mensajeBusqueda =
          'Necesitas permitir acceso a la cámara para escanear. Puedes escribir el código manualmente.';
        return;
      }
      const resultado = await BarcodeScanner.scan({ formats: this.formatosComerciales, autoZoom: true });
      const codigo = resultado.barcodes[0]?.rawValue?.trim();
      if (!codigo) {
        this.mensajeBusqueda = 'No se detectó ningún código. Puedes escribirlo manualmente.';
        return;
      }
      await this.scanFeedback.feedbackLecturaCorrecta();
      await this.procesarCodigo(codigo);
    } catch (error: unknown) {
      console.error('No se pudo escanear el código', error);
      this.mensajeBusqueda = 'No se pudo usar la cámara. Puedes escribir el código manualmente.';
    } finally {
      this.leyendoCodigo = false;
    }
  }

  async tomarFotoParaCodigo(): Promise<void> {
    await this.leerCodigoDesdeOrigen(CameraSource.Camera);
  }

  async elegirFotoParaCodigo(): Promise<void> {
    await this.leerCodigoDesdeOrigen(CameraSource.Photos);
  }

  async seleccionarCodigo(codigo: string): Promise<void> {
    const emitirFeedback = this.feedbackCamaraPendiente;
    this.feedbackCamaraPendiente = false;
    this.mostrarSelectorCodigos = false;
    this.codigosDetectados = [];
    if (emitirFeedback) await this.scanFeedback.feedbackLecturaCorrecta();
    await this.procesarCodigo(codigo);
  }

  editarProductoEncontrado(): void {
    const encontrado = this.productoEncontrado;
    if (!encontrado) return;
    this.productoEncontrado = null;
    this.editarProducto(encontrado);
  }

  usarSugerenciaPublica(): void {
    const sugerencia = this.sugerenciaPublica;
    if (!sugerencia) return;
    if (sugerencia.nombre) this.formProducto.nombre = sugerencia.nombre;
    if (sugerencia.tamano) this.formProducto.tamano = sugerencia.tamano;
    if (sugerencia.presentacion) this.formProducto.presentacion = sugerencia.presentacion;
    if (sugerencia.imagenUrl) this.formProducto.imagen = sugerencia.imagenUrl;
    const marca = this.marcas.find(
      (item) => (item.nombreMarca || '').toLowerCase() === (sugerencia.marca || '').toLowerCase(),
    );
    const categoria = this.categorias.find(
      (item) => (item.nombreCat || '').toLowerCase() === (sugerencia.categoria || '').toLowerCase(),
    );
    if (marca) this.formProducto.idMarca = marca.idMarca;
    if (categoria) this.formProducto.idCat = categoria.idCat;
    this.mensajeBusqueda = 'Información sugerida aplicada. Revisa los datos antes de guardar.';
    this.sugerenciaPublica = null;
  }

  continuarManualmente(): void {
    this.sugerenciaPublica = null;
    this.mensajeBusqueda = 'Continúa completando el producto manualmente.';
  }

  quitarImagen(): void {
    this.formProducto.imagen = '';
    this.reiniciarFotoPendiente();
  }

  cambioUrlImagen(): void {
    if (this.fotoProductoPendiente) this.reiniciarFotoPendiente();
  }

  async tomarFotoProducto(): Promise<void> {
    await this.prepararFotoProducto(CameraSource.Camera);
  }

  async elegirFotoProducto(): Promise<void> {
    await this.prepararFotoProducto(CameraSource.Photos);
  }

  resolverImagenProducto(imagen: string | null | undefined): string | null {
    return this.api.resolverImagenProducto(imagen);
  }

  ocultarImagen(evento: Event): void {
    const imagen = evento.target;
    if (imagen instanceof HTMLImageElement) imagen.hidden = true;
  }

  mostrarImagen(evento: Event): void {
    const imagen = evento.target;
    if (imagen instanceof HTMLImageElement) imagen.hidden = false;
  }

  async eliminarProducto(producto: Producto): Promise<void> {
    if (
      !(await this.confirmarAccion(
        'Eliminar producto',
        `¿Quieres eliminar “${producto.nombrePro}”? Solo podrá eliminarse si no tiene movimientos relacionados.`,
        'Eliminar',
      ))
    )
      return;
    try {
      const respuesta = await firstValueFrom(this.api.deleteProducto(producto.idPro));
      this.productos = this.productos.filter((item) => item.idPro !== producto.idPro);
      try {
        await this.sqlite.eliminarProductoLocal(producto.idPro);
      } catch (error: unknown) {
        console.error('Producto eliminado en MySQL, pero no en SQLite', error);
      }
      await this.mostrarFeedback(respuesta.message, 'success');
    } catch (error: unknown) {
      const mensaje =
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Este producto tiene movimientos asociados y no puede eliminarse.'
          : this.mensajeErrorHttp(error, 'No pudimos eliminar el producto.');
      await this.mostrarFeedback(mensaje, 'danger');
    }
  }

  abrirNuevoCatalogo(tipo: TipoCatalogo, desdeProducto = false): void {
    this.tipoCatalogo = tipo;
    this.catalogoEditandoId = null;
    this.formCatalogo = { nombre: '', descripcion: '' };
    this.catalogoDesdeProducto = desdeProducto;
    this.mostrarModalCatalogo = true;
  }

  editarMarca(marca: Marca): void {
    this.catalogoDesdeProducto = false;
    this.tipoCatalogo = 'marca';
    this.catalogoEditandoId = marca.idMarca;
    this.formCatalogo = { nombre: marca.nombreMarca || '', descripcion: marca.descripMarca || '' };
    this.mostrarModalCatalogo = true;
  }

  editarCategoria(categoria: Categoria): void {
    this.catalogoDesdeProducto = false;
    this.tipoCatalogo = 'categoria';
    this.catalogoEditandoId = categoria.idCat;
    this.formCatalogo = { nombre: categoria.nombreCat || '', descripcion: categoria.descripCat || '' };
    this.mostrarModalCatalogo = true;
  }

  cancelarModalCatalogo(): void {
    this.mostrarModalCatalogo = false;
    if (this.catalogoDesdeProducto) {
      this.catalogoDesdeProducto = false;
    }
  }

  async guardarCatalogo(): Promise<void> {
    if (this.guardandoCatalogo) return;
    const dto: CatalogoDto = {
      nombre: this.formCatalogo.nombre.trim(),
      descripcion: this.formCatalogo.descripcion.trim(),
    };
    if (!dto.nombre) {
      await this.mostrarFeedback(
        `Ingresa el nombre de la ${this.tipoCatalogo === 'marca' ? 'marca' : 'categoría'}.`,
        'warning',
      );
      return;
    }

    this.guardandoCatalogo = true;
    try {
      let nuevoId: number;
      if (this.tipoCatalogo === 'marca') {
        const marca =
          this.catalogoEditandoId === null
            ? await firstValueFrom(this.catalogosApi.crearMarca(dto))
            : await firstValueFrom(this.catalogosApi.actualizarMarca(this.catalogoEditandoId, dto));
        this.marcas = this.reemplazarPorId(this.marcas, marca, 'idMarca');
        nuevoId = marca.idMarca;
      } else {
        const categoria =
          this.catalogoEditandoId === null
            ? await firstValueFrom(this.catalogosApi.crearCategoria(dto))
            : await firstValueFrom(this.catalogosApi.actualizarCategoria(this.catalogoEditandoId, dto));
        this.categorias = this.reemplazarPorId(this.categorias, categoria, 'idCat');
        nuevoId = categoria.idCat;
      }
      this.mostrarModalCatalogo = false;
      if (this.catalogoDesdeProducto && this.catalogoEditandoId === null) {
        if (this.tipoCatalogo === 'marca') this.formProducto.idMarca = nuevoId;
        else this.formProducto.idCat = nuevoId;
        this.catalogoDesdeProducto = false;
      }
      await this.mostrarFeedback(
        `${this.tipoCatalogo === 'marca' ? 'Marca' : 'Categoría'} guardada correctamente.`,
        'success',
      );
    } catch (error: unknown) {
      await this.mostrarFeedback(this.mensajeErrorHttp(error, 'No se pudo guardar el registro.'), 'danger');
    } finally {
      this.guardandoCatalogo = false;
    }
  }
  get saludoActual(): string {
    const hora = new Date().getHours();

    if (hora >= 5 && hora < 12) {
      return 'Buenos días';
    }

    if (hora >= 12 && hora < 19) {
      return 'Buenas tardes';
    }

    return 'Buenas noches';
  }
  async eliminarMarca(marca: Marca): Promise<void> {
    if (!(await this.confirmarAccion('Eliminar marca', `¿Quieres eliminar “${marca.nombreMarca}”?`, 'Eliminar')))
      return;
    try {
      const respuesta = await firstValueFrom(this.catalogosApi.eliminarMarca(marca.idMarca));
      this.marcas = this.marcas.filter((item) => item.idMarca !== marca.idMarca);
      await this.mostrarFeedback(respuesta.message, 'success');
    } catch (error: unknown) {
      await this.mostrarFeedback(this.mensajeErrorHttp(error, 'No se pudo eliminar la marca.'), 'danger');
    }
  }

  async eliminarCategoria(categoria: Categoria): Promise<void> {
    if (!(await this.confirmarAccion('Eliminar categoría', `¿Quieres eliminar “${categoria.nombreCat}”?`, 'Eliminar')))
      return;
    try {
      const respuesta = await firstValueFrom(this.catalogosApi.eliminarCategoria(categoria.idCat));
      this.categorias = this.categorias.filter((item) => item.idCat !== categoria.idCat);
      await this.mostrarFeedback(respuesta.message, 'success');
    } catch (error: unknown) {
      await this.mostrarFeedback(this.mensajeErrorHttp(error, 'No se pudo eliminar la categoría.'), 'danger');
    }
  }

  async scanQR(): Promise<void> {
    await this.escanearCodigoEnVivo();
  }

  private async leerCodigoDesdeOrigen(origen: CameraSource): Promise<void> {
    if (this.leyendoCodigo || this.buscandoProducto) return;
    this.leyendoCodigo = true;
    this.feedbackCamaraPendiente = false;
    if (origen === CameraSource.Camera) await this.scanFeedback.preparar();
    try {
      if (origen === CameraSource.Camera) {
        const permisos = await Camera.checkPermissions();
        const estado =
          permisos.camera === 'granted' ? permisos : await Camera.requestPermissions({ permissions: ['camera'] });
        if (estado.camera !== 'granted') {
          this.mensajeBusqueda = 'Necesitas permitir acceso a la cámara. Puedes escribir el código manualmente.';
          return;
        }
      }
      const foto = await this.obtenerFoto(origen);
      const ruta = foto.path || foto.webPath;
      if (!ruta) {
        this.mensajeBusqueda = 'No fue posible leer la fotografía. Puedes escribir el código manualmente.';
        return;
      }
      const resultado = await BarcodeScanner.readBarcodesFromImage({
        path: ruta,
        formats: this.formatosComerciales,
      });
      const codigos = [...new Set(resultado.barcodes.map((item) => item.rawValue?.trim() || '').filter(Boolean))];
      if (codigos.length === 0) {
        this.mensajeBusqueda = 'No se detectó ningún código en la fotografía. Puedes escribirlo manualmente.';
        return;
      }
      if (codigos.length > 1) {
        this.codigosDetectados = codigos;
        this.feedbackCamaraPendiente = origen === CameraSource.Camera;
        this.mostrarSelectorCodigos = true;
        return;
      }
      if (origen === CameraSource.Camera) await this.scanFeedback.feedbackLecturaCorrecta();
      await this.procesarCodigo(codigos[0]);
    } catch (error: unknown) {
      if (!this.esCancelacionCamara(error)) {
        console.error('No se pudo analizar la fotografía', error);
        this.mensajeBusqueda = 'No se pudo analizar la fotografía. Puedes escribir el código manualmente.';
      }
    } finally {
      this.leyendoCodigo = false;
    }
  }

  private esCancelacionCamara(error: unknown): boolean {
    const mensaje = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return mensaje.includes('cancel') || mensaje.includes('user cancelled');
  }

  private obtenerFoto(origen: CameraSource): Promise<Photo> {
    return Camera.getPhoto({
      source: origen,
      resultType: CameraResultType.Uri,
      quality: 90,
      allowEditing: false,
      saveToGallery: false,
      correctOrientation: true,
      webUseInput: true,
    });
  }

  private async prepararFotoProducto(origen: CameraSource): Promise<void> {
    try {
      if (origen === CameraSource.Camera) {
        const permisos = await Camera.checkPermissions();
        const estado =
          permisos.camera === 'granted' ? permisos : await Camera.requestPermissions({ permissions: ['camera'] });
        if (estado.camera !== 'granted') {
          await this.mostrarFeedback('Necesitas permitir acceso a la cámara para tomar la fotografía.', 'warning');
          return;
        }
      }
      const foto = await this.obtenerFoto(origen);
      const preview = foto.webPath || foto.path;
      if (!preview) throw new Error('La cámara no devolvió una ruta de imagen');
      const respuesta = await fetch(preview);
      const blob = await respuesta.blob();
      const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
      if (!tiposPermitidos.includes(blob.type)) {
        await this.mostrarFeedback('Selecciona una imagen JPEG, PNG o WEBP.', 'warning');
        return;
      }
      if (blob.size > 5 * 1024 * 1024) {
        await this.mostrarFeedback('La imagen no puede superar 5 MB.', 'warning');
        return;
      }
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      this.fotoProductoPendiente = blob;
      this.nombreFotoPendiente = `producto.${extension}`;
      this.previewFotoPendiente = preview;
    } catch (error: unknown) {
      if (!this.esCancelacionCamara(error)) {
        console.error('No se pudo preparar la foto del producto', error);
        await this.mostrarFeedback('No pudimos preparar la fotografía seleccionada.', 'danger');
      }
    }
  }

  private reiniciarFotoPendiente(): void {
    this.fotoProductoPendiente = null;
    this.nombreFotoPendiente = '';
    this.previewFotoPendiente = null;
  }

  private datosFormularioProducto(): DatosProductoFormulario | null {
    const f = this.formProducto;
    this.erroresProducto = this.validarFormularioProducto(f);
    const primerCampo = Object.keys(this.erroresProducto)[0] as CampoProducto | undefined;
    if (primerCampo) {
      this.enfocarCampoInvalido(primerCampo);
      void this.mostrarFeedback(this.erroresProducto[primerCampo] || 'Revisa los datos del producto.', 'warning');
      return null;
    }
    return {
      nombre: f.nombre.trim(),
      precio: Number(f.precio),
      costo: f.costo === null ? null : Number(f.costo),
      existencia: Number(f.existencia),
      stockMinimo: f.stockMinimo === null ? null : Number(f.stockMinimo),
      tamano: f.tamano.trim(),
      presentacion: f.presentacion.trim(),
      tipo: f.tipo.trim(),
      codigoQR: f.codigoQR.trim(),
      sku: f.sku.trim(),
      imagen: f.imagen.trim(),
      idMarca: f.idMarca!,
      idCat: f.idCat!,
    };
  }

  private validarFormularioProducto(f: FormularioProducto): ErroresProducto {
    const errores: ErroresProducto = {};
    if (!f.nombre.trim()) errores.nombre = 'Ingresa el nombre del producto.';
    if (f.precio === null) errores.precio = 'El precio es obligatorio.';
    else if (!Number.isFinite(Number(f.precio)) || Number(f.precio) < 0)
      errores.precio = 'El precio debe ser mayor o igual a cero.';
    if (f.costo !== null && (!Number.isFinite(Number(f.costo)) || Number(f.costo) < 0))
      errores.costo = 'El costo debe ser mayor o igual a cero.';
    if (f.existencia === null) errores.existencia = 'El stock es obligatorio.';
    else if (!Number.isInteger(Number(f.existencia)) || Number(f.existencia) < 0)
      errores.existencia = 'El stock debe ser un entero mayor o igual a cero.';
    if (f.stockMinimo !== null && (!Number.isInteger(Number(f.stockMinimo)) || Number(f.stockMinimo) < 0))
      errores.stockMinimo = 'El stock mínimo debe ser un entero mayor o igual a cero.';
    if (f.idCat === null) errores.idCat = 'Selecciona una categoría.';
    if (f.idMarca === null) errores.idMarca = 'Selecciona una marca.';
    return errores;
  }

  private enfocarCampoInvalido(campo: CampoProducto): void {
    requestAnimationFrame(() => {
      const elemento = document.getElementById(`producto-${campo}`) as
        (HTMLElement & { setFocus?: () => Promise<void> }) | null;
      elemento?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      void elemento?.setFocus?.();
    });
  }

  private mapearProductoDto(datos: DatosProductoFormulario): CrearProductoDto {
    return {
      nombre: datos.nombre,
      precio: datos.precio,
      costo: datos.costo,
      existencia: datos.existencia,
      stockMinimo: datos.stockMinimo,
      tamano: datos.tamano,
      presentacion: datos.presentacion,
      tipo: datos.tipo,
      codigoQR: datos.codigoQR || null,
      sku: datos.sku || null,
      imagen: datos.imagen || null,
      idMarca: datos.idMarca,
      idCat: datos.idCat,
    };
  }

  private formularioProductoVacio(): FormularioProducto {
    return {
      nombre: '',
      precio: null,
      costo: null,
      existencia: 0,
      stockMinimo: null,
      tamano: '',
      presentacion: '',
      tipo: '',
      codigoQR: '',
      sku: '',
      imagen: '',
      idMarca: null,
      idCat: null,
    };
  }

  private limpiarBusquedaPublica(): void {
    this.sugerenciaPublica = null;
    this.mensajeBusqueda = '';
    this.productoEncontrado = null;
  }

  private actualizarProductoEnLista(producto: Producto): void {
    this.productos = this.productosUnicos(this.reemplazarPorId(this.productos, producto, 'idPro'));
  }

  private productosUnicos(productos: Producto[]): Producto[] {
    const porId = new Map<number, Producto>();
    for (const producto of productos) porId.set(Number(producto.idPro), producto);
    return [...porId.values()];
  }

  private reemplazarPorId<T>(elementos: T[], elemento: T, llave: keyof T): T[] {
    const indice = elementos.findIndex((actual) => String(actual[llave]) === String(elemento[llave]));
    if (indice < 0) return [...elementos, elemento];
    return elementos.map((actual, posicion) => (posicion === indice ? elemento : actual));
  }

  private async mostrarFeedback(mensaje: string, tipo: TipoFeedback): Promise<void> {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: tipo === 'danger' ? 4200 : 3000,
      position: 'top',
      color: tipo,
      cssClass: ['pastel-toast', `toast-${tipo}`],
      buttons: [{ icon: 'close-outline', role: 'cancel' }],
    });
    await toast.present();
  }

  private async confirmarAccion(titulo: string, mensaje: string, confirmar: string): Promise<boolean> {
    const alerta = await this.alertController.create({
      header: titulo,
      message: mensaje,
      cssClass: 'pastel-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: confirmar, role: 'confirm', cssClass: 'alert-destructive' },
      ],
    });
    await alerta.present();
    const resultado = await alerta.onDidDismiss();
    return resultado.role === 'confirm';
  }

  private mensajeErrorHttp(error: unknown, predeterminado: string): string {
    if (!(error instanceof HttpErrorResponse)) return predeterminado;
    if (error.status === 0) return 'No fue posible conectar con el servidor.';
    if (typeof error.error?.message === 'string') return error.error.message;
    return predeterminado;
  }
}
