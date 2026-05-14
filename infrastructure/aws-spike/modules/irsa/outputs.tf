output "controller_role_arn" {
  value = aws_iam_role.controller.arn
}

output "apiserver_role_arn" {
  value = aws_iam_role.apiserver.arn
}
