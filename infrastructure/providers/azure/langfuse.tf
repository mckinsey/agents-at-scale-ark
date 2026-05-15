resource "kubernetes_namespace" "langfuse" {
  metadata {
    name = "langfuse"
  }

  depends_on = [azurerm_kubernetes_cluster.aks]
}

resource "kubernetes_secret" "langfuse_db" {
  metadata {
    name      = "langfuse-db-secret"
    namespace = kubernetes_namespace.langfuse.metadata[0].name
  }

  data = {
    DATABASE_URL = "postgresql://${var.postgres_admin_username}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/${var.langfuse_db_name}?sslmode=require"
  }

  depends_on = [
    azurerm_postgresql_flexible_server.postgres,
    azurerm_postgresql_flexible_server_database.langfuse
  ]
}

resource "kubernetes_secret" "langfuse_secrets" {
  metadata {
    name      = "langfuse-secrets"
    namespace = kubernetes_namespace.langfuse.metadata[0].name
  }

  data = {
    NEXTAUTH_SECRET = var.langfuse_nextauth_secret
    SALT            = var.langfuse_salt
  }
}

resource "helm_release" "langfuse" {
  name       = "langfuse"
  repository = "https://langfuse.github.io/langfuse-k8s"
  chart      = "langfuse"
  version    = var.langfuse_version
  namespace  = kubernetes_namespace.langfuse.metadata[0].name

  values = [
    yamlencode({
      langfuse = {
        nextauth = {
          url = "http://localhost:3000"
        }
        telemetryEnabled = false
      }

      service = {
        type = "LoadBalancer"
        port = 3000
      }

      env = [
        {
          name = "DATABASE_URL"
          valueFrom = {
            secretKeyRef = {
              name = kubernetes_secret.langfuse_db.metadata[0].name
              key  = "DATABASE_URL"
            }
          }
        },
        {
          name = "NEXTAUTH_SECRET"
          valueFrom = {
            secretKeyRef = {
              name = kubernetes_secret.langfuse_secrets.metadata[0].name
              key  = "NEXTAUTH_SECRET"
            }
          }
        },
        {
          name = "SALT"
          valueFrom = {
            secretKeyRef = {
              name = kubernetes_secret.langfuse_secrets.metadata[0].name
              key  = "SALT"
            }
          }
        },
        {
          name  = "PORT"
          value = "3000"
        }
      ]

      ingress = {
        enabled = false
      }

      replicaCount = 2

      resources = {
        requests = {
          cpu    = "500m"
          memory = "512Mi"
        }
        limits = {
          cpu    = "1000m"
          memory = "1Gi"
        }
      }
    })
  ]

  depends_on = [
    kubernetes_secret.langfuse_db,
    kubernetes_secret.langfuse_secrets
  ]
}
