-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: tienda
-- ------------------------------------------------------
-- Server version	8.4.8

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `cargo`
--

DROP TABLE IF EXISTS `cargo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cargo` (
  `idCargo` int NOT NULL AUTO_INCREMENT,
  `nombreCargo` varchar(100) DEFAULT NULL,
  `descripcionCargo` varchar(200) DEFAULT NULL,
  `idSuc` int DEFAULT NULL,
  PRIMARY KEY (`idCargo`),
  UNIQUE KEY `uq_cargo_sucursal_nombre` (`idSuc`,`nombreCargo`),
  CONSTRAINT `cargo_ibfk_1` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cargo`
--

LOCK TABLES `cargo` WRITE;
/*!40000 ALTER TABLE `cargo` DISABLE KEYS */;
INSERT INTO `cargo` VALUES (1,'ADMINISTRADOR','Acceso completo a la administración de la tienda',1),(2,'CAJERO','Acceso al punto de venta y cobro de productos',1);
/*!40000 ALTER TABLE `cargo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categoria`
--

DROP TABLE IF EXISTS `categoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categoria` (
  `idCat` int NOT NULL AUTO_INCREMENT,
  `nombreCat` varchar(100) DEFAULT NULL,
  `descripCat` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`idCat`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categoria`
--

LOCK TABLES `categoria` WRITE;
/*!40000 ALTER TABLE `categoria` DISABLE KEYS */;
INSERT INTO `categoria` VALUES (2,'Refrescos','Bebidas carbonatadas'),(3,'alimentos','j'),(4,'Lociones','js');
/*!40000 ALTER TABLE `categoria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cliente`
--

DROP TABLE IF EXISTS `cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cliente` (
  `idCliente` int NOT NULL AUTO_INCREMENT,
  `nombreCliente` varchar(100) NOT NULL,
  `apellidoPatCliente` varchar(100) DEFAULT NULL,
  `apellidoMatCliente` varchar(100) DEFAULT NULL,
  `correoCliente` varchar(150) NOT NULL,
  `googleSub` varchar(255) NOT NULL,
  `fotoPerfil` text,
  `estadoCliente` tinyint(1) NOT NULL DEFAULT '1',
  `fechaRegistro` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimoAcceso` datetime DEFAULT NULL,
  PRIMARY KEY (`idCliente`),
  UNIQUE KEY `uq_cliente_correo` (`correoCliente`),
  UNIQUE KEY `uq_cliente_google_sub` (`googleSub`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cliente`
--

LOCK TABLES `cliente` WRITE;
/*!40000 ALTER TABLE `cliente` DISABLE KEYS */;
INSERT INTO `cliente` VALUES (1,'Sandra','Sanchez Garcia',NULL,'sandisg321@gmail.com','112850685949394108985','https://lh3.googleusercontent.com/a/ACg8ocIJMPP9WjSS1Q24EvkIWBfw2WViU4TmsTmYSiDX6fsI3iew7lhadA=s96-c',1,'2026-08-27 22:07:41','2026-08-28 14:16:38'),(8,'Sandibell','Sánchez',NULL,'sanchezsandibell0@gmail.com','113116239049522862563','https://lh3.googleusercontent.com/a/ACg8ocJibMkXat3_rQQN_O4QFu0m5BgRVZ34steAf1Y7l93XZlaCOw=s96-c',1,'2026-08-28 13:06:20','2026-08-28 13:06:20'),(9,'Consultorios',NULL,NULL,'consultorios452@gmail.com','105142001509885596007','https://lh3.googleusercontent.com/a/ACg8ocKkjRmRyBvGMUa8gupz-o0JYVKFLXqw0LjpH50A-MwA_dUT-w=s96-c',1,'2026-08-28 13:14:27','2026-08-28 13:14:27');
/*!40000 ALTER TABLE `cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compra`
--

DROP TABLE IF EXISTS `compra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compra` (
  `idCompra` int NOT NULL AUTO_INCREMENT,
  `fechaCompra` date DEFAULT NULL,
  `horaCompra` time DEFAULT NULL,
  `totalCompra` decimal(10,2) DEFAULT NULL,
  `idProv` int DEFAULT NULL,
  `idSuc` int DEFAULT NULL,
  `idEmp` int DEFAULT NULL,
  PRIMARY KEY (`idCompra`),
  KEY `idProv` (`idProv`),
  KEY `idSuc` (`idSuc`),
  KEY `idEmp` (`idEmp`),
  CONSTRAINT `compra_ibfk_1` FOREIGN KEY (`idProv`) REFERENCES `proveedor` (`idProv`),
  CONSTRAINT `compra_ibfk_2` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`),
  CONSTRAINT `compra_ibfk_3` FOREIGN KEY (`idEmp`) REFERENCES `empleados` (`idEmp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compra`
--

LOCK TABLES `compra` WRITE;
/*!40000 ALTER TABLE `compra` DISABLE KEYS */;
/*!40000 ALTER TABLE `compra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion_transferencia`
--

DROP TABLE IF EXISTS `configuracion_transferencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_transferencia` (
  `idConfiguracion` int NOT NULL AUTO_INCREMENT,
  `idSuc` int NOT NULL,
  `banco` varchar(100) NOT NULL,
  `titular` varchar(150) NOT NULL,
  `clabe` varchar(18) DEFAULT NULL,
  `numeroCuenta` varchar(50) DEFAULT NULL,
  `instrucciones` varchar(1000) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fechaActualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idConfiguracion`),
  UNIQUE KEY `uq_transferencia_sucursal` (`idSuc`),
  CONSTRAINT `fk_transferencia_sucursal` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion_transferencia`
--

LOCK TABLES `configuracion_transferencia` WRITE;
/*!40000 ALTER TABLE `configuracion_transferencia` DISABLE KEYS */;
INSERT INTO `configuracion_transferencia` VALUES (6,1,'BBVA','Sandra Sanchez Garcia','012180015250213582','1525021358','Realiza tu tranferencia a esta cuenta para poder realizar el pedido.',1,'2026-08-28 13:11:26');
/*!40000 ALTER TABLE `configuracion_transferencia` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detalle_pedido_cliente`
--

DROP TABLE IF EXISTS `detalle_pedido_cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalle_pedido_cliente` (
  `idDetallePedido` int NOT NULL AUTO_INCREMENT,
  `idPedido` int NOT NULL,
  `idPro` int NOT NULL,
  `cantidad` int NOT NULL,
  `precioUnitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`idDetallePedido`),
  KEY `idx_detalle_pedido_idPedido` (`idPedido`),
  KEY `idx_detalle_pedido_idPro` (`idPro`),
  CONSTRAINT `fk_detalle_pedido_pedido` FOREIGN KEY (`idPedido`) REFERENCES `pedido_cliente` (`idPedido`),
  CONSTRAINT `fk_detalle_pedido_producto` FOREIGN KEY (`idPro`) REFERENCES `productos` (`idPro`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detalle_pedido_cliente`
--

LOCK TABLES `detalle_pedido_cliente` WRITE;
/*!40000 ALTER TABLE `detalle_pedido_cliente` DISABLE KEYS */;
INSERT INTO `detalle_pedido_cliente` VALUES (24,26,1,1,50.00,50.00),(25,27,1,1,50.00,50.00),(26,28,1,1,50.00,50.00);
/*!40000 ALTER TABLE `detalle_pedido_cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detcompra`
--

DROP TABLE IF EXISTS `detcompra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detcompra` (
  `idDetCompra` int NOT NULL AUTO_INCREMENT,
  `idCompra` int DEFAULT NULL,
  `idPro` int DEFAULT NULL,
  `cantidadDetCompra` int DEFAULT NULL,
  `subtotalDetCompra` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`idDetCompra`),
  KEY `idCompra` (`idCompra`),
  KEY `idPro` (`idPro`),
  CONSTRAINT `detcompra_ibfk_1` FOREIGN KEY (`idCompra`) REFERENCES `compra` (`idCompra`),
  CONSTRAINT `detcompra_ibfk_2` FOREIGN KEY (`idPro`) REFERENCES `productos` (`idPro`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detcompra`
--

LOCK TABLES `detcompra` WRITE;
/*!40000 ALTER TABLE `detcompra` DISABLE KEYS */;
/*!40000 ALTER TABLE `detcompra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detventa`
--

DROP TABLE IF EXISTS `detventa`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detventa` (
  `idDetVenta` int NOT NULL AUTO_INCREMENT,
  `idVenta` int DEFAULT NULL,
  `idPro` int DEFAULT NULL,
  `cantidadDetVenta` int DEFAULT NULL,
  `precioUnitarioDetVenta` decimal(10,2) NOT NULL DEFAULT '0.00',
  `subtotalDetVenta` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`idDetVenta`),
  KEY `idVenta` (`idVenta`),
  KEY `idPro` (`idPro`),
  CONSTRAINT `detventa_ibfk_1` FOREIGN KEY (`idVenta`) REFERENCES `venta` (`idVenta`),
  CONSTRAINT `detventa_ibfk_2` FOREIGN KEY (`idPro`) REFERENCES `productos` (`idPro`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detventa`
--

LOCK TABLES `detventa` WRITE;
/*!40000 ALTER TABLE `detventa` DISABLE KEYS */;
INSERT INTO `detventa` VALUES (1,1,1,1,50.00,50.00),(2,2,1,1,50.00,50.00),(3,3,1,1,50.00,50.00),(4,4,1,1,50.00,50.00),(5,5,1,1,50.00,50.00),(6,6,1,1,50.00,50.00),(7,7,1,1,50.00,50.00),(14,14,1,1,50.00,50.00),(15,15,1,1,50.00,50.00);
/*!40000 ALTER TABLE `detventa` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `direccion`
--

DROP TABLE IF EXISTS `direccion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `direccion` (
  `idDir` int NOT NULL AUTO_INCREMENT,
  `pais` varchar(50) DEFAULT NULL,
  `estado` varchar(50) DEFAULT NULL,
  `municipio` varchar(50) DEFAULT NULL,
  `colonia` varchar(50) DEFAULT NULL,
  `calle` varchar(50) DEFAULT NULL,
  `noExt` varchar(10) DEFAULT NULL,
  `noInt` varchar(10) DEFAULT NULL,
  `codPostal` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`idDir`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `direccion`
--

LOCK TABLES `direccion` WRITE;
/*!40000 ALTER TABLE `direccion` DISABLE KEYS */;
/*!40000 ALTER TABLE `direccion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `empleados`
--

DROP TABLE IF EXISTS `empleados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empleados` (
  `idEmp` int NOT NULL AUTO_INCREMENT,
  `nombreEmp` varchar(100) DEFAULT NULL,
  `apellidoPatEmp` varchar(100) DEFAULT NULL,
  `apellidoMatEmp` varchar(100) DEFAULT NULL,
  `edadPer` int DEFAULT NULL,
  `generoPer` varchar(20) DEFAULT NULL,
  `fechaIngreso` date DEFAULT NULL,
  `fechaEntrada` date DEFAULT NULL,
  `fechaSalida` date DEFAULT NULL,
  `correoEmp` varchar(100) NOT NULL,
  `contrasenaHash` varchar(255) DEFAULT NULL,
  `estadoEmp` tinyint(1) NOT NULL DEFAULT '1',
  `googleSub` varchar(255) DEFAULT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `fotoPerfil` text,
  `idDir` int DEFAULT NULL,
  `idCargo` int DEFAULT NULL,
  PRIMARY KEY (`idEmp`),
  UNIQUE KEY `uq_empleados_correo` (`correoEmp`),
  UNIQUE KEY `uq_empleados_google_sub` (`googleSub`),
  KEY `idDir` (`idDir`),
  KEY `idCargo` (`idCargo`),
  CONSTRAINT `empleados_ibfk_1` FOREIGN KEY (`idDir`) REFERENCES `direccion` (`idDir`),
  CONSTRAINT `empleados_ibfk_2` FOREIGN KEY (`idCargo`) REFERENCES `cargo` (`idCargo`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `empleados`
--

LOCK TABLES `empleados` WRITE;
/*!40000 ALTER TABLE `empleados` DISABLE KEYS */;
INSERT INTO `empleados` VALUES (1,'Administrador','Tienda',NULL,NULL,NULL,'2026-08-27',NULL,NULL,'admin@gmail.com','$2b$12$LrHug.oGSGD1HyV/DjAmweZMkuOpyaGAmLf7LVBvSBcSO7Gg.j4xu',1,NULL,NULL,NULL,NULL,1),(2,'Diana Elena','Sanchez','Garcia',NULL,NULL,'2010-08-27',NULL,NULL,'diana@gmail.com','$2b$12$bxT2KK0A1pXZeMNdSlv6jeCAqy9cjqgGpPYCsWbnvWeZDcSQQ4KHa',1,NULL,'7298456578',NULL,NULL,2);
/*!40000 ALTER TABLE `empleados` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marca`
--

DROP TABLE IF EXISTS `marca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marca` (
  `idMarca` int NOT NULL AUTO_INCREMENT,
  `nombreMarca` varchar(100) DEFAULT NULL,
  `descripMarca` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`idMarca`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marca`
--

LOCK TABLES `marca` WRITE;
/*!40000 ALTER TABLE `marca` DISABLE KEYS */;
INSERT INTO `marca` VALUES (1,'Coca-Cola','Bebidas'),(2,'Yopi','j'),(3,'Nivea','pop'),(4,'obao','us'),(5,'Desodorantes','lol');
/*!40000 ALTER TABLE `marca` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `movimiento_caja`
--

DROP TABLE IF EXISTS `movimiento_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movimiento_caja` (
  `idMovimientoCaja` int NOT NULL AUTO_INCREMENT,
  `uuidMovimientoCaja` char(36) DEFAULT NULL,
  `idSesionCaja` int NOT NULL,
  `tipoMovimiento` enum('INGRESO','RETIRO') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `fechaHora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idEmp` int NOT NULL,
  PRIMARY KEY (`idMovimientoCaja`),
  UNIQUE KEY `uq_movimiento_caja_uuid` (`uuidMovimientoCaja`),
  KEY `fk_movimiento_sesion` (`idSesionCaja`),
  KEY `fk_movimiento_empleado` (`idEmp`),
  CONSTRAINT `fk_movimiento_empleado` FOREIGN KEY (`idEmp`) REFERENCES `empleados` (`idEmp`),
  CONSTRAINT `fk_movimiento_sesion` FOREIGN KEY (`idSesionCaja`) REFERENCES `sesion_caja` (`idSesionCaja`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `movimiento_caja`
--

LOCK TABLES `movimiento_caja` WRITE;
/*!40000 ALTER TABLE `movimiento_caja` DISABLE KEYS */;
INSERT INTO `movimiento_caja` VALUES (1,'991b1ef6-3c29-4528-b908-73e9ae001beb',1,'INGRESO',100.00,'Validación automática','2026-08-27 18:48:38',2),(2,'80567e73-02af-42b9-9b9b-2b27fae00bed',2,'INGRESO',100.00,'Cierre final controlado','2026-08-27 19:07:08',2),(3,'f365a84b-482e-48da-98c8-a801daab7aa0',2,'RETIRO',50.00,'Cierre final controlado','2026-08-27 19:07:08',2);
/*!40000 ALTER TABLE `movimiento_caja` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedido_cliente`
--

DROP TABLE IF EXISTS `pedido_cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido_cliente` (
  `idPedido` int NOT NULL AUTO_INCREMENT,
  `uuidPedido` char(36) NOT NULL,
  `idCliente` int NOT NULL,
  `idSuc` int NOT NULL,
  `fechaPedido` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `total` decimal(10,2) NOT NULL,
  `estado` enum('PENDIENTE_PAGO','EN_REVISION','PAGADO','RECHAZADO','CANCELADO','EXPIRADO','LISTO','ENTREGADO') NOT NULL DEFAULT 'PENDIENTE_PAGO',
  `fechaLimitePago` datetime DEFAULT NULL,
  `comprobanteRuta` varchar(500) DEFAULT NULL,
  `comprobanteMime` varchar(100) DEFAULT NULL,
  `comprobanteNombre` varchar(255) DEFAULT NULL,
  `fechaComprobante` datetime DEFAULT NULL,
  `idEmpRevisa` int DEFAULT NULL,
  `fechaRevision` datetime DEFAULT NULL,
  `motivoRechazo` varchar(255) DEFAULT NULL,
  `idVenta` int DEFAULT NULL,
  `bancoSnapshot` varchar(100) DEFAULT NULL,
  `titularSnapshot` varchar(150) DEFAULT NULL,
  `clabeSnapshot` varchar(18) DEFAULT NULL,
  `numeroCuentaSnapshot` varchar(50) DEFAULT NULL,
  `instruccionesSnapshot` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`idPedido`),
  UNIQUE KEY `uq_pedido_cliente_uuid` (`uuidPedido`),
  KEY `idx_pedido_cliente_cliente` (`idCliente`),
  KEY `idx_pedido_cliente_sucursal` (`idSuc`),
  KEY `idx_pedido_cliente_estado` (`estado`),
  KEY `idx_pedido_cliente_estado_limite` (`estado`,`fechaLimitePago`),
  KEY `idx_pedido_cliente_empleado_revision` (`idEmpRevisa`),
  KEY `idx_pedido_cliente_venta` (`idVenta`),
  CONSTRAINT `fk_pedido_cliente_cliente` FOREIGN KEY (`idCliente`) REFERENCES `cliente` (`idCliente`),
  CONSTRAINT `fk_pedido_cliente_empleado_revision` FOREIGN KEY (`idEmpRevisa`) REFERENCES `empleados` (`idEmp`),
  CONSTRAINT `fk_pedido_cliente_sucursal` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`),
  CONSTRAINT `fk_pedido_cliente_venta` FOREIGN KEY (`idVenta`) REFERENCES `venta` (`idVenta`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedido_cliente`
--

LOCK TABLES `pedido_cliente` WRITE;
/*!40000 ALTER TABLE `pedido_cliente` DISABLE KEYS */;
INSERT INTO `pedido_cliente` VALUES (26,'0c96bab5-79fb-482b-b62b-37c8d669e555',1,1,'2026-08-28 13:11:46',50.00,'CANCELADO','2026-08-28 15:11:46',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(27,'736d639a-7694-4de0-961f-9e97b2e90ef9',1,1,'2026-08-28 13:12:52',50.00,'LISTO','2026-08-28 15:12:52','ec8938a3-369e-4679-a773-860ae4ab0087.pdf','application/pdf','ticket-7.pdf','2026-08-28 13:13:05',1,'2026-08-28 13:25:34',NULL,15,NULL,NULL,NULL,NULL,NULL),(28,'290cda2d-7ad0-4298-8862-05e3b90d23f2',1,1,'2026-08-28 14:16:50',50.00,'CANCELADO','2026-08-28 16:16:50',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'BBVA','Sandra Sanchez Garcia','012180015250213582','1525021358','Realiza tu tranferencia a esta cuenta para poder realizar el pedido.');
/*!40000 ALTER TABLE `pedido_cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `productos`
--

DROP TABLE IF EXISTS `productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `productos` (
  `idPro` int NOT NULL AUTO_INCREMENT,
  `nombrePro` varchar(100) DEFAULT NULL,
  `precioVentaPro` decimal(10,2) DEFAULT NULL,
  `costoPro` decimal(10,2) DEFAULT NULL,
  `existenciaPro` int DEFAULT NULL,
  `stockMinimoPro` int DEFAULT NULL,
  `tamanoPro` varchar(50) DEFAULT NULL,
  `presentacionPro` varchar(50) DEFAULT NULL,
  `tipoPro` varchar(50) DEFAULT NULL,
  `codigoQR` varchar(200) DEFAULT NULL,
  `skuPro` varchar(100) DEFAULT NULL,
  `imagenPro` text,
  `activoPro` tinyint(1) NOT NULL DEFAULT '1',
  `idMarca` int DEFAULT NULL,
  `idCat` int DEFAULT NULL,
  PRIMARY KEY (`idPro`),
  UNIQUE KEY `codigoQR` (`codigoQR`),
  KEY `idMarca` (`idMarca`),
  KEY `idCat` (`idCat`),
  CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`idMarca`) REFERENCES `marca` (`idMarca`),
  CONSTRAINT `productos_ibfk_2` FOREIGN KEY (`idCat`) REFERENCES `categoria` (`idCat`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `productos`
--

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
INSERT INTO `productos` VALUES (1,'Coca-Cola',50.00,45.00,5,NULL,'3L','Rojo','Refresco','7501054549864',NULL,NULL,1,1,2),(6,'Obao',30.00,25.00,5,1,'65g','blanco con negro','Desodorante antitransparente','7509552876383',NULL,'/uploads/productos/766b486f-3efc-4179-89b1-c1ea1a38f178.jpg',1,5,4);
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `proveedor`
--

DROP TABLE IF EXISTS `proveedor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedor` (
  `idProv` int NOT NULL AUTO_INCREMENT,
  `nombreProv` varchar(100) DEFAULT NULL,
  `telefonoProv` varchar(15) DEFAULT NULL,
  `correoProv` varchar(100) DEFAULT NULL,
  `pagwebProv` varchar(100) DEFAULT NULL,
  `redsocialProv` varchar(100) DEFAULT NULL,
  `idDir` int DEFAULT NULL,
  PRIMARY KEY (`idProv`),
  KEY `idDir` (`idDir`),
  CONSTRAINT `proveedor_ibfk_1` FOREIGN KEY (`idDir`) REFERENCES `direccion` (`idDir`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `proveedor`
--

LOCK TABLES `proveedor` WRITE;
/*!40000 ALTER TABLE `proveedor` DISABLE KEYS */;
/*!40000 ALTER TABLE `proveedor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sesion_caja`
--

DROP TABLE IF EXISTS `sesion_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sesion_caja` (
  `idSesionCaja` int NOT NULL AUTO_INCREMENT,
  `uuidSesionCaja` char(36) DEFAULT NULL,
  `idEmp` int NOT NULL,
  `idSuc` int NOT NULL,
  `fechaHoraApertura` datetime NOT NULL,
  `fondoInicial` decimal(10,2) NOT NULL DEFAULT '0.00',
  `fechaHoraCierre` datetime DEFAULT NULL,
  `totalVentas` decimal(10,2) DEFAULT NULL,
  `totalEfectivo` decimal(10,2) DEFAULT NULL,
  `totalTarjeta` decimal(10,2) DEFAULT NULL,
  `totalTransferencia` decimal(10,2) DEFAULT NULL,
  `totalIngresos` decimal(10,2) DEFAULT NULL,
  `totalRetiros` decimal(10,2) DEFAULT NULL,
  `efectivoEsperado` decimal(10,2) DEFAULT NULL,
  `efectivoContado` decimal(10,2) DEFAULT NULL,
  `diferencia` decimal(10,2) DEFAULT NULL,
  `numeroVentas` int DEFAULT NULL,
  `estado` enum('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA',
  `observaciones` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idSesionCaja`),
  UNIQUE KEY `uq_sesion_caja_uuid` (`uuidSesionCaja`),
  KEY `fk_sesion_caja_empleado` (`idEmp`),
  KEY `fk_sesion_caja_sucursal` (`idSuc`),
  CONSTRAINT `fk_sesion_caja_empleado` FOREIGN KEY (`idEmp`) REFERENCES `empleados` (`idEmp`),
  CONSTRAINT `fk_sesion_caja_sucursal` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sesion_caja`
--

LOCK TABLES `sesion_caja` WRITE;
/*!40000 ALTER TABLE `sesion_caja` DISABLE KEYS */;
INSERT INTO `sesion_caja` VALUES (1,'6486c696-8980-4e97-a52d-a4dc459bfc2c',2,1,'2026-08-27 18:48:38',500.00,'2026-08-27 18:48:38',0.00,0.00,0.00,0.00,100.00,0.00,600.00,600.00,0.00,0,'CERRADA','Validación automática'),(2,'f21925ec-1b32-48f7-a495-74082fb4eb1b',2,1,'2026-08-27 19:07:08',500.00,'2026-08-27 19:07:08',50.00,50.00,0.00,0.00,100.00,50.00,600.00,600.00,0.00,1,'CERRADA','Cierre final controlado'),(3,'092cd725-e236-41fd-9046-2ef6112db734',2,1,'2026-08-27 19:36:15',1000.00,'2026-08-27 19:37:13',0.00,0.00,0.00,0.00,0.00,0.00,1000.00,1000.00,0.00,0,'CERRADA',NULL),(4,'fd0a807a-617d-4c38-b611-3d7a6ab2f6ce',2,1,'2026-08-27 19:44:42',500.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'ABIERTA',NULL),(5,'ba95303a-6cc8-4d5f-89e3-775b4e94a2c1',1,1,'2026-08-27 19:48:24',100.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'ABIERTA',NULL);
/*!40000 ALTER TABLE `sesion_caja` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sucursal`
--

DROP TABLE IF EXISTS `sucursal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sucursal` (
  `idSuc` int NOT NULL AUTO_INCREMENT,
  `nombreSuc` varchar(100) DEFAULT NULL,
  `descripcionSuc` varchar(255) DEFAULT NULL,
  `telefonoSuc` varchar(15) DEFAULT NULL,
  `correoSuc` varchar(100) DEFAULT NULL,
  `paginaWebSuc` varchar(100) DEFAULT NULL,
  `redSocialSuc` varchar(100) DEFAULT NULL,
  `logoSuc` text,
  `idDir` int DEFAULT NULL,
  PRIMARY KEY (`idSuc`),
  KEY `idDir` (`idDir`),
  CONSTRAINT `sucursal_ibfk_1` FOREIGN KEY (`idDir`) REFERENCES `direccion` (`idDir`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sucursal`
--

LOCK TABLES `sucursal` WRITE;
/*!40000 ALTER TABLE `sucursal` DISABLE KEYS */;
INSERT INTO `sucursal` VALUES (1,'Doña paty','Somos tu mejor opción','7298456512','paty@gmail.com',NULL,NULL,'/uploads/tienda/5569ed24-97db-4d1e-bba9-65bb8e69c031.jpg',NULL);
/*!40000 ALTER TABLE `sucursal` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `venta`
--

DROP TABLE IF EXISTS `venta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `venta` (
  `idVenta` int NOT NULL AUTO_INCREMENT,
  `uuidVenta` char(36) DEFAULT NULL,
  `fechaVenta` date DEFAULT NULL,
  `horaVenta` time DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `metodoPago` enum('EFECTIVO','TARJETA','TRANSFERENCIA') NOT NULL DEFAULT 'EFECTIVO',
  `montoRecibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT '0.00',
  `estadoVenta` enum('COMPLETADA','CANCELADA') NOT NULL DEFAULT 'COMPLETADA',
  `fechaCancelacion` datetime DEFAULT NULL,
  `motivoCancelacion` varchar(255) DEFAULT NULL,
  `idEmpCancela` int DEFAULT NULL,
  `idEmp` int DEFAULT NULL,
  `idSuc` int DEFAULT NULL,
  `idSesionCaja` int DEFAULT NULL,
  PRIMARY KEY (`idVenta`),
  UNIQUE KEY `uq_venta_uuid` (`uuidVenta`),
  KEY `idEmp` (`idEmp`),
  KEY `idSuc` (`idSuc`),
  KEY `fk_venta_empleado_cancela` (`idEmpCancela`),
  KEY `fk_venta_sesion_caja` (`idSesionCaja`),
  CONSTRAINT `fk_venta_empleado_cancela` FOREIGN KEY (`idEmpCancela`) REFERENCES `empleados` (`idEmp`),
  CONSTRAINT `fk_venta_sesion_caja` FOREIGN KEY (`idSesionCaja`) REFERENCES `sesion_caja` (`idSesionCaja`),
  CONSTRAINT `venta_ibfk_1` FOREIGN KEY (`idEmp`) REFERENCES `empleados` (`idEmp`),
  CONSTRAINT `venta_ibfk_2` FOREIGN KEY (`idSuc`) REFERENCES `sucursal` (`idSuc`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `venta`
--

LOCK TABLES `venta` WRITE;
/*!40000 ALTER TABLE `venta` DISABLE KEYS */;
INSERT INTO `venta` VALUES (1,NULL,'2026-08-27','16:29:23',50.00,'EFECTIVO',60.00,10.00,'COMPLETADA',NULL,NULL,NULL,2,1,NULL),(2,NULL,'2026-08-27','16:29:23',50.00,'TARJETA',NULL,0.00,'COMPLETADA',NULL,NULL,NULL,2,1,NULL),(3,NULL,'2026-08-27','16:29:23',50.00,'TRANSFERENCIA',NULL,0.00,'COMPLETADA',NULL,NULL,NULL,2,1,NULL),(4,'593ad0da-7c98-47f6-b4b7-2a96d145da3f','2026-08-27','18:48:38',50.00,'EFECTIVO',100.00,50.00,'CANCELADA','2026-08-27 18:48:38','Validación automática de caja',1,2,1,1),(5,'0cb64aa6-c20f-4aa0-94e8-b45a1f9509bc','2026-08-27','19:07:08',50.00,'EFECTIVO',100.00,50.00,'CANCELADA','2026-08-27 19:07:08','Validación final controlada',1,2,1,2),(6,'6fa2f32e-ebb3-401e-b39e-828f6023c900','2026-08-27','19:07:08',50.00,'EFECTIVO',100.00,50.00,'COMPLETADA',NULL,NULL,NULL,2,1,2),(7,'03bfdc2f-f11e-427f-b4e8-a4d632a23283','2026-08-27','19:46:17',50.00,'EFECTIVO',100.00,50.00,'COMPLETADA',NULL,NULL,NULL,2,1,4),(14,'978dfa1e-46a0-40db-a356-22d8be9b2a30','2026-08-28','13:21:54',50.00,'TRANSFERENCIA',NULL,0.00,'COMPLETADA',NULL,NULL,NULL,1,1,5),(15,'30e976ae-6cdf-4df8-8aaa-a42b38cf4322','2026-08-28','13:25:34',50.00,'TRANSFERENCIA',NULL,0.00,'COMPLETADA',NULL,NULL,NULL,1,1,NULL);
/*!40000 ALTER TABLE `venta` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-28 14:34:03
