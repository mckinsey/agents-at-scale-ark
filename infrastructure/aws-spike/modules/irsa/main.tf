data "aws_iam_policy_document" "controller_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:${var.controller_namespace}:${var.controller_service_account}"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "controller" {
  name               = "${var.cluster_name}-ark-controller"
  assume_role_policy = data.aws_iam_policy_document.controller_trust.json
  tags               = var.tags
}

data "aws_iam_policy_document" "apiserver_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:${var.apiserver_namespace}:${var.apiserver_service_account}"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apiserver" {
  name               = "${var.cluster_name}-ark-apiserver"
  assume_role_policy = data.aws_iam_policy_document.apiserver_trust.json
  tags               = var.tags
}

data "aws_iam_policy_document" "apiserver_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [var.rds_password_secret_arn]
  }
}

resource "aws_iam_role_policy" "apiserver_secrets" {
  name   = "read-rds-password"
  role   = aws_iam_role.apiserver.id
  policy = data.aws_iam_policy_document.apiserver_secrets.json
}
