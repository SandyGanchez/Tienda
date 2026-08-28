CREATE TABLE IF NOT EXISTS cliente (
  idCliente INT NOT NULL AUTO_INCREMENT,
  nombreCliente VARCHAR(100) NOT NULL,
  apellidoPatCliente VARCHAR(100) DEFAULT NULL,
  apellidoMatCliente VARCHAR(100) DEFAULT NULL,
  correoCliente VARCHAR(150) NOT NULL,
  googleSub VARCHAR(255) NOT NULL,
  fotoPerfil TEXT DEFAULT NULL,
  estadoCliente TINYINT(1) NOT NULL DEFAULT 1,
  fechaRegistro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimoAcceso DATETIME DEFAULT NULL,
  PRIMARY KEY (idCliente),
  UNIQUE KEY uq_cliente_correo (correoCliente),
  UNIQUE KEY uq_cliente_google_sub (googleSub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
