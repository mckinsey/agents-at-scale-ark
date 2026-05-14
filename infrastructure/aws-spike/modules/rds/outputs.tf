output "endpoint" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "database_name" {
  value = aws_db_instance.this.db_name
}

output "username" {
  value = aws_db_instance.this.username
}

output "password_secret_arn" {
  value = aws_secretsmanager_secret.this.arn
}

output "password_secret_name" {
  value = aws_secretsmanager_secret.this.name
}

output "security_group_id" {
  value = aws_security_group.this.id
}
