variable "aws_region" {
  description = "Región de AWS para desplegar la infraestructura"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Perfil de AWS CLI a utilizar"
  type        = string
  default     = "terra-profile"
}

variable "bucket_name" {
  description = "Nombre del bucket S3 para alojar el frontend estático"
  type        = string
  default     = "tienda-donapaty-frontend"
}

variable "environment" {
  description = "Entorno de despliegue (production, staging, dev)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Identificador base de la aplicación"
  type        = string
  default     = "tienda-donapaty"
}

variable "jwt_secret" {
  description = "Clave secreta para firmar tokens JWT"
  type        = string
  default     = "tienda-secret-jwt-key-2026-production"
  sensitive   = true
}

variable "google_client_id" {
  description = "Google Client ID para autenticación OAuth"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google Client Secret para autenticación OAuth"
  type        = string
  default     = ""
  sensitive   = true
}

variable "hashids_salt" {
  description = "Salt para ofuscación de IDs"
  type        = string
  default     = "TiendaHashidsSaltSecret2026"
  sensitive   = true
}

variable "uploads_bucket_name" {
  description = "Nombre del bucket S3 para almacenamiento de imágenes y comprobantes"
  type        = string
  default     = "tienda-donapaty-uploads"
}

