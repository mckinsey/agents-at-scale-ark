{{/*
ValidatingAdmissionPolicy that protects the marketplace installer service account of
one tenant namespace. marketplace-install.yaml renders it as a resource of the release.

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
  variables:
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
  validations:
  {{- /*
     Tenant users and cluster admins may not run workloads or create token Secrets as the
     installer. Only the installer itself and the controllers may.
  */}}
  - expression: "!variables.usesInstaller || variables.trusted"
    message: {{ printf "only the marketplace installer may run workloads or mint tokens as %s" (include "ark-tenant.marketplaceInstaller.serviceAccount" $root) | quote }}
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
