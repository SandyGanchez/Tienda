import { encodeId } from '../utils/formatters';

export const toMarcaDto = (marca: any) => {
  if (!marca) return null;
  return {
    id: encodeId(marca.idMarca),
    nombre: marca.nombreMarca,
    descripcion: marca.descripMarca,
  };
};

export const toCategoriaDto = (categoria: any) => {
  if (!categoria) return null;
  return {
    id: encodeId(categoria.idCat),
    nombre: categoria.nombreCat,
    descripcion: categoria.descripCat,
  };
};

export const toSucursalDto = (sucursal: any) => {
  if (!sucursal) return null;
  const d = sucursal.direccion;
  const direccionStr = d
    ? typeof d === 'string'
      ? d
      : [d.calle, [d.noExt, d.noInt].filter(Boolean).join(' '), d.colonia, d.municipio, d.estado, d.codPostal, d.pais]
          .filter(Boolean)
          .join(', ') || null
    : null;

  return {
    id: encodeId(sucursal.idSuc),
    idSuc: sucursal.idSuc,
    nombre: sucursal.nombreSuc,
    nombreSuc: sucursal.nombreSuc,
    descripcion: sucursal.descripcionSuc,
    descripcionSuc: sucursal.descripcionSuc,
    telefono: sucursal.telefonoSuc,
    telefonoSuc: sucursal.telefonoSuc,
    correo: sucursal.correoSuc,
    correoSuc: sucursal.correoSuc,
    paginaWeb: sucursal.paginaWebSuc,
    paginaWebSuc: sucursal.paginaWebSuc,
    redSocial: sucursal.redSocialSuc,
    redSocialSuc: sucursal.redSocialSuc,
    logo: sucursal.logoSuc,
    logoSuc: sucursal.logoSuc,
    direccion: direccionStr,
  };
};

export const toSucursalPublicaDto = (sucursal: any) => {
  if (!sucursal) return null;
  return {
    id: encodeId(sucursal.idSuc),
    idSuc: sucursal.idSuc,
    nombre: sucursal.nombreSuc,
    nombreSuc: sucursal.nombreSuc,
    descripcion: sucursal.descripcionSuc,
    descripcionSuc: sucursal.descripcionSuc,
    logo: sucursal.logoSuc,
    logoSuc: sucursal.logoSuc,
  };
};
