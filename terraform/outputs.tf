output "s3_bucket_name" {
  description = "Nombre del bucket S3 para el frontend"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución de CloudFront"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "Dominio público generado por CloudFront"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  description = "URL HTTPS pública del frontend desplegado"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "deploy_command_hint" {
  description = "Comando sugerido para sincronizar el build de Angular a S3 e invalidar cache"
  value       = "aws s3 sync ../www/ s3://${aws_s3_bucket.frontend.id} --profile ${var.aws_profile} --delete && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.frontend.id} --paths '/*' --profile ${var.aws_profile}"
}

output "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB Single-Table"
  value       = aws_dynamodb_table.tienda.name
}

output "lambda_function_name" {
  description = "Nombre de la funcion Lambda del backend"
  value       = aws_lambda_function.api.function_name
}

output "api_gateway_endpoint" {
  description = "URL publica HTTPS del API Gateway HTTP API"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

