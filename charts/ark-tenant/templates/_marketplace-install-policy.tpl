{{/*
ValidatingAdmissionPolicy that protects the marketplace installer service account of
one tenant namespace. marketplace-install.yaml renders it twice: as a resource of the
release and as a -bootstrap copy in a pre-install and pre-upgrade hook, so a copy exists
before the installer account whenever the account is first created.

Who sends the requests it looks at:
- the installer service account: ark-api impersonates it to create the install Job
  (no pod-name extra), and helm runs as it inside that Job's pod (pod-name extra);
- ark-api's own service account, which holds the install lock Lease;
- Kubernetes controllers, which create the pods of workloads and garbage collect them;
- tenant users, who may create Jobs, Deployments and Secrets with the tenant Role, and
  pick any service account of the namespace for them;
- cluster admins, who get no exception either.
*/}}
{{- define "ark-tenant.marketplaceInstall.policy" -}}
{{- $root := .root }}
{{- $name := printf "%s%s" (include "ark-tenant.marketplaceInstall.policyName" $root) .suffix }}
{{- $fullname := include "ark-tenant.fullname" $root }}
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: {{ $name }}
  labels:
    {{- include "ark-tenant.labels" $root | nindent 4 }}
  {{- with .policyAnnotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  failurePolicy: Fail
  {{- /* Requests the policy sees. Each validation below narrows them to its own case. */}}
  matchConstraints:
    resourceRules:
    - apiGroups: [""]
      apiVersions: ["v1"]
      operations: [CREATE, UPDATE]
      resources: [pods, secrets, replicationcontrollers]
    - apiGroups: [batch]
      apiVersions: ["v1"]
      operations: [CREATE, UPDATE]
      resources: [jobs, cronjobs]
    - apiGroups: [apps]
      apiVersions: ["v1"]
      operations: [CREATE, UPDATE]
      resources: [deployments, statefulsets, daemonsets, replicasets]
    - apiGroups: [rbac.authorization.k8s.io]
      apiVersions: ["v1"]
      operations: [CREATE, UPDATE]
      resources: [roles, rolebindings]
    - apiGroups: [coordination.k8s.io]
      apiVersions: ["v1"]
      operations: [CREATE, UPDATE, DELETE]
      resources: [leases]
  variables:
  {{- /*
     Writes to the install lock Lease. A DELETE without a name is a collection delete,
     which would remove the lock too.
  */}}
  - name: isLock
    expression: >-
      request.resource.group == 'coordination.k8s.io' &&
      (request.operation == 'DELETE'
        ? (request.name == '' || request.name == {{ include "ark-tenant.marketplaceInstall.lockName" $root | squote }})
        : object.metadata.name == {{ include "ark-tenant.marketplaceInstall.lockName" $root | squote }})
  {{- /*
     Requests on workload kinds and Secrets: the only objects here that can run code
     or carry a token as a service account.
  */}}
  - name: isWorkload
    expression: "request.resource.group in ['', 'batch', 'apps']"
  {{- /* ark-api's own service account, the only holder of the install lock. */}}
  - name: arkApiUser
    expression: {{ include "ark-tenant.marketplaceInstall.arkApiUsername" $root | squote | quote }}
  {{- /*
     The installer service account. Helm runs as it inside the install pod, and ark-api
     impersonates it to create the install Job.
  */}}
  - name: installer
    expression: {{ include "ark-tenant.marketplaceInstaller.serviceAccount" $root | squote | quote }}
  {{- /* The username of the installer service account. */}}
  - name: installerUser
    expression: {{ include "ark-tenant.marketplaceInstaller.username" $root | squote | quote }}
  {{- /*
     Controllers that create the pods of a workload or strip owner references while
     garbage collecting. They act on objects someone else created, and that creation
     went through the rules below.
  */}}
  - name: controllers
    expression: >-
      ['system:kube-controller-manager',
       'system:serviceaccount:kube-system:job-controller',
       'system:serviceaccount:kube-system:cronjob-controller',
       'system:serviceaccount:kube-system:replicaset-controller',
       'system:serviceaccount:kube-system:deployment-controller',
       'system:serviceaccount:kube-system:statefulset-controller',
       'system:serviceaccount:kube-system:daemon-set-controller',
       'system:serviceaccount:kube-system:replication-controller',
       'system:serviceaccount:kube-system:generic-garbage-collector']
  {{- /*
     The pod template of the object, wherever its kind keeps it. Null for Secrets and
     for objects without a template.
  */}}
  - name: podSpec
    expression: >-
      object.kind == 'Pod' ? object.spec :
      object.kind == 'CronJob' ? object.spec.jobTemplate.spec.template.spec :
      object.kind == 'Secret' ? null :
      has(object.spec.template) && has(object.spec.template.spec) ? object.spec.template.spec : null
  {{- /*
     The object runs as the installer service account, through serviceAccountName or
     the legacy serviceAccount field, or it is a token Secret for that account.
  */}}
  - name: usesInstaller
    expression: >-
      object.kind == 'Secret'
        ? (object.type == 'kubernetes.io/service-account-token' &&
           has(object.metadata.annotations) &&
           'kubernetes.io/service-account.name' in object.metadata.annotations &&
           object.metadata.annotations['kubernetes.io/service-account.name'] == variables.installer)
        : (variables.podSpec != null &&
           ((has(variables.podSpec.serviceAccountName) && variables.podSpec.serviceAccountName == variables.installer) ||
            (has(variables.podSpec.serviceAccount) && variables.podSpec.serviceAccount == variables.installer)))
  {{- /*
     Who may use the installer service account: the account itself (ark-api impersonating
     it, or helm) and, for workloads, the controllers. Only the account itself may create
     token Secrets for it.
  */}}
  - name: trusted
    expression: >-
      request.userInfo.username == variables.installerUser ||
      (object.kind != 'Secret' && request.userInfo.username in variables.controllers)
  {{- /*
     The request comes from helm inside the install pod: the installer account with a
     token bound to a pod, which carries the pod-name extra. ark-api's impersonated
     requests have no extra. has() is required: without extras the field is missing,
     reading it errors and, with failurePolicy Fail, every such request would be denied.
  */}}
  - name: fromInstallPod
    expression: >-
      request.userInfo.username == variables.installerUser &&
      has(request.userInfo.extra) &&
      'authentication.kubernetes.io/pod-name' in request.userInfo.extra
  {{- /*
     Roles of this tenant chart. Binding one is as good as holding its rules: the
     impersonate Role, for one, makes the subject an admin of the namespace.
  */}}
  - name: tenantRoles
    expression: >-
      [{{ printf "%s-role" $fullname | squote }},
       {{ printf "%s-marketplace-installer" $fullname | squote }},
       {{ printf "%s-marketplace-installer-extra" $fullname | squote }},
       {{ printf "%s-marketplace-impersonate" $fullname | squote }},
       {{ printf "%s-marketplace-lock" $fullname | squote }}]
  {{- /*
     RoleBinding subjects a chart may use: service accounts of this namespace and users
     outside system:. Groups are refused.
  */}}
  - name: safeSubjects
    expression: >-
      object.kind != 'RoleBinding' || !has(object.subjects) ||
      object.subjects.all(s,
        (s.kind == 'ServiceAccount' && (!has(s.namespace) || s.namespace == request.namespace)) ||
        (s.kind == 'User' && !s.name.startsWith('system:')))
  {{- /*
     Role rules a chart may create: nothing on RBAC, no wildcards, no Secret writes,
     nothing that runs code in another pod or mints tokens, no impersonation. RBAC
     escalation checks already refuse rules the installer does not hold; these cover
     what admin grants.
  */}}
  - name: safeRules
    expression: >-
      object.kind != 'Role' || !has(object.rules) ||
      object.rules.all(r,
        !(has(r.apiGroups) && r.apiGroups.exists(g, g == 'rbac.authorization.k8s.io' || g == '*')) &&
        !(has(r.resources) && r.resources.exists(x, x == '*' || x.startsWith('*/') ||
          x in ['pods/exec', 'pods/attach', 'pods/ephemeralcontainers', 'serviceaccounts/token'])) &&
        !r.verbs.exists(v, v == '*' || v == 'impersonate') &&
        !(has(r.resources) && r.resources.exists(x, x == 'secrets') &&
          r.verbs.exists(v, v in ['create', 'update', 'patch', 'delete', 'deletecollection'])))
  {{- /*
     Secrets that pass for personal ones: the u-<16 hex>- name of a personal secret, or
     an ark.mckinsey.com/scope label other than shared.
  */}}
  - name: reservedSecret
    expression: >-
      object.kind == 'Secret' &&
      ((has(object.metadata.name) && object.metadata.name.matches('^u-[0-9a-f]{16}-')) ||
       (has(object.metadata.labels) && 'ark.mckinsey.com/scope' in object.metadata.labels &&
        object.metadata.labels['ark.mckinsey.com/scope'] != 'shared'))
  validations:
  {{- /*
     Tenant users and cluster admins may not run workloads or create token Secrets as the
     installer. Only the installer itself and the controllers may.
  */}}
  - expression: "!variables.isWorkload || !variables.usesInstaller || variables.trusted"
    message: {{ printf "only the marketplace installer may run workloads or mint tokens as %s" (include "ark-tenant.marketplaceInstaller.serviceAccount" $root) | quote }}
  {{- /*
     Only ark-api may create, update or delete the install lock. The namespace controller
     may delete it when the namespace goes away, and kube-controller-manager covers
     distributions that run every controller under that one identity.
  */}}
  - expression: >-
      !variables.isLock ||
      request.userInfo.username == variables.arkApiUser ||
      (request.operation == 'DELETE' &&
       request.userInfo.username in ['system:serviceaccount:kube-system:namespace-controller', 'system:kube-controller-manager'])
    message: "only ark-api may hold or release the marketplace install lock"
  {{- /*
     Helm in the install pod may not start workloads or create token Secrets as the
     installer: a chart would keep its permissions for good.
  */}}
  - expression: "!variables.fromInstallPod || !variables.isWorkload || !variables.usesInstaller"
    message: {{ printf "a chart may not run workloads or mint tokens as %s" (include "ark-tenant.marketplaceInstaller.serviceAccount" $root) | quote }}
  {{- /*
     Helm in the install pod may bind only Roles the chart creates itself, and only to
     service accounts of this namespace or to users outside system:.
  */}}
  - expression: >-
      !variables.fromInstallPod || object.kind != 'RoleBinding' ||
      (object.roleRef.kind == 'Role' && !(object.roleRef.name in variables.tenantRoles) && variables.safeSubjects)
    message: "a chart may bind only its own Roles, and only to service accounts of this namespace or to users outside system:"
  {{- /* Helm in the install pod may not create Roles with the rules safeRules refuses. */}}
  - expression: "!variables.fromInstallPod || variables.safeRules"
    message: "a chart may not create Roles over RBAC, wildcards, Secret writes, pods/exec, pods/attach, pods/ephemeralcontainers, serviceaccounts/token or impersonate"
  {{- /* Helm in the install pod may not create Secrets that pass for personal secrets. */}}
  - expression: "!variables.fromInstallPod || !variables.reservedSecret"
    message: "a chart may not create Secrets with a personal secret name or a non-shared ark.mckinsey.com/scope label"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: {{ $name }}
  labels:
    {{- include "ark-tenant.labels" $root | nindent 4 }}
  {{- with .bindingAnnotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  policyName: {{ $name }}
  {{- /*
     Enforcing, on this namespace only. ark-api checks these fields before it enables
     installs, so keep the binding free of resourceRules and objectSelector.
  */}}
  validationActions: [Deny]
  matchResources:
    namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: {{ $root.Release.Namespace }}
{{- end }}
