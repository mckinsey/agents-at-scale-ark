# Image name and tag for building/pushing image targets
IMAGE ?= ark-controller
IMAGE_TAG ?= latest

# Version information
VERSION ?= $(shell cat version.txt 2>/dev/null || echo "dev")
GIT_COMMIT ?= $(shell git rev-parse HEAD 2>/dev/null || echo "unknown")

# Go build flags for version injection
LDFLAGS := -ldflags "-X main.Version=$(VERSION) -X main.GitCommit=$(GIT_COMMIT)"

# Get the currently used golang install path (in GOPATH/bin, unless GOBIN is set)
ifeq (,$(shell go env GOBIN))
GOBIN=$(shell go env GOPATH)/bin
else
GOBIN=$(shell go env GOBIN)
endif

# CONTAINER_TOOL defines the container tool to be used for building images.
# Be aware that the target commands are only tested with Docker which is
# scaffolded by default. However, you might want to replace it to use other
# tools. (i.e. podman)
CONTAINER_TOOL ?= docker

# Setting SHELL to bash allows bash commands to be executed by recipes.
# Options are set to exit when a recipe line exits non-zero or a piped command fails.
SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

.PHONY: all
all: build

##@ General

# The help target prints out all targets with their descriptions organized
# beneath their categories. The categories are represented by '##@' and the
# target descriptions by '##'. The awk command is responsible for reading the
# entire set of makefiles included in this invocation, looking for lines of the
# file as xyz: ## something, and then pretty-format the target and help. Then,
# if there's a line with ##@ something, that gets pretty-printed as a category.
# More info on the usage of ANSI control characters for terminal formatting:
# https://en.wikipedia.org/wiki/ANSI_escape_code#SGR_parameters
# More info on the awk command:
# http://linuxcommand.org/lc3_adv_awk.php

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: manifests
manifests: controller-gen ## Generate CRDs and sync to Helm chart.
	$(CONTROLLER_GEN) rbac:roleName=ark-controller-role,fileName=ark_controller_role.yaml crd webhook paths="./..." output:crd:artifacts:config=config/crd/bases
	@./scripts/sync-chart-crds.sh

.PHONY: generate
generate: controller-gen ## Generate code containing DeepCopy, DeepCopyInto, and DeepCopyObject method implementations.
	$(CONTROLLER_GEN) object:headerFile="hack/boilerplate.go.txt" paths="./..."

.PHONY: fmt
fmt: ## Run go fmt against code.
	go fmt ./...

.PHONY: vet
vet: ## Run go vet against code.
	go vet ./...

.PHONY: test
test: manifests generate fmt vet setup-envtest ## Run tests.
	KUBEBUILDER_ASSETS="$(shell $(ENVTEST) use $(ENVTEST_K8S_VERSION) --bin-dir $(LOCALBIN) -p path)" go test -v $$(go list ./... | grep -v /e2e) -coverprofile cover.out

# TODO(user): To use a different vendor for e2e tests, modify the setup under 'tests/e2e'.
# The default setup assumes Kind is pre-installed and builds/loads the Manager Docker image locally.
# CertManager is installed by default; skip with:
# - CERT_MANAGER_INSTALL_SKIP=true

.PHONY: lint
lint: golangci-lint ## Run golangci-lint linter
	$(GOLANGCI_LINT) run

.PHONY: lint-fix
lint-fix: golangci-lint ## Run golangci-lint linter and perform fixes
	$(GOLANGCI_LINT) run --fix

.PHONY: lint-config
lint-config: golangci-lint ## Verify golangci-lint linter configuration
	$(GOLANGCI_LINT) config verify

##@ Build

.PHONY: build
build: validate-chart-crds manifests generate fmt vet ## Build manager binary.
	go build $(LDFLAGS) -o bin/manager cmd/main.go

.PHONY: run
run: manifests generate fmt vet
	scripts/tls-certs.sh
	ENABLE_WEBHOOKS=true go run ./cmd/main.go --webhook-cert-path=certs

.PHONY: dev
dev:
	ENABLE_WEBHOOKS=false go run $(LDFLAGS) ./cmd/main.go


##@ Deployment

ifndef ignore-not-found
  ignore-not-found = false
endif


.PHONY: chart
chart: manifests
	kubebuilder edit --plugins helm/v1-alpha
	@echo "⚠️  WARNING: Our Helm chart has manual customizations that override kubebuilder defaults:"
	@echo "   - controller-manager renamed to ark-controller in all selectors"
	@echo "   - serviceAccountName changed from ark-controller-manager to ark-controller"
	@echo "   - containerRegistry values added to support registry-credentials template"  
	@echo "   - metrics service selectors updated to match ark-controller"
	@echo ""
	@echo "🔍 After regenerating chart, manually fix these files:"
	@echo "   - dist/chart/templates/webhook/service.yaml (control-plane: controller-manager → ark-controller)"
	@echo "   - dist/chart/templates/metrics/metrics-service.yaml (control-plane: controller-manager → ark-controller)" 
	@echo "   - dist/chart/templates/prometheus/monitor.yaml (control-plane: controller-manager → ark-controller)"
	@echo "   - dist/chart/values.yaml (serviceAccountName: ark-controller-manager → ark-controller)"
	@echo "   - dist/chart/values.yaml (add containerRegistry section if missing)"
	@echo ""
	@exit 1

.PHONY: validate-chart-crds
validate-chart-crds: ## Validate that CRDs in Helm chart match source CRDs
	@./scripts/validate-chart-crds.sh

.PHONY: build-container
build-container: ## Build the ark-controller
	$(CONTAINER_TOOL) build \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		-t $(IMAGE):$(IMAGE_TAG) \
		-f Dockerfile . 

.PHONY: deploy
deploy: manifests ## Deploy controller and cert-manager to the K8s cluster specified in ~/.kube/config.
	# NOTE: cert-manager might be better in 'prepare-cluster' target as it's required infra rather than ark-deployment
	@helm repo add jetstack https://charts.jetstack.io --force-update
	@helm repo update
	@helm upgrade --install cert-manager jetstack/cert-manager \
		--namespace cert-manager \
		--create-namespace \
		--set crds.enabled=true
	kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml
	../scripts/build-and-push.sh -i $(IMAGE) -t $(IMAGE_TAG) -f Dockerfile -c . -b VERSION=$(VERSION) -b GIT_COMMIT=$(GIT_COMMIT)
	# Deploy controller with impersonation enabled for development
	helm upgrade --install ark-controller ./dist/chart \
		--namespace ark-system \
		--create-namespace \
		--wait --timeout=300s \
		--set controllerManager.container.image.repository=$(IMAGE) \
		--set controllerManager.container.image.tag=$(IMAGE_TAG) \
		--set controllerManager.container.image.pullPolicy=IfNotPresent \
		--set rbac.enable=true \
		--set rbac.impersonation.enabled=true

.PHONY: undeploy
undeploy: ## Remove ARK controller from the cluster
	helm uninstall ark-controller -n ark-system --ignore-not-found
	# Clean up ARK CRDs that might conflict with Helm ownership
	$(KUBECTL) get crd -o name | grep ark.mckinsey.com | xargs -r $(KUBECTL) delete --ignore-not-found=true || true
	# Clean up ARK ClusterRoles and ClusterRoleBindings that might conflict with Helm ownership
	$(KUBECTL) get clusterroles -o name | grep ark- | xargs -r $(KUBECTL) delete --ignore-not-found=true || true
	$(KUBECTL) get clusterrolebindings -o name | grep ark- | xargs -r $(KUBECTL) delete --ignore-not-found=true || true

.PHONY: eject-controller
eject-controller: ## Scale down ARK controller to zero replicas for out-of-cluster development
	kubectl scale deployment ark-controller -n ark-system --replicas=0

##@ Dependencies

## Location to install dependencies to
LOCALBIN ?= $(shell pwd)/bin
$(LOCALBIN):
	mkdir -p $(LOCALBIN)

## Tool Binaries
KUBECTL ?= kubectl
KIND ?= kind
KUSTOMIZE ?= $(LOCALBIN)/kustomize
CONTROLLER_GEN ?= $(LOCALBIN)/controller-gen
ENVTEST ?= $(LOCALBIN)/setup-envtest
GOLANGCI_LINT = $(LOCALBIN)/golangci-lint

## Tool Versions
KUSTOMIZE_VERSION ?= v5.6.0
CONTROLLER_TOOLS_VERSION ?= v0.18.0
#ENVTEST_VERSION is the version of controller-runtime release branch to fetch the envtest setup script (i.e. release-0.20)
ENVTEST_VERSION ?= $(shell go list -m -f "{{ .Version }}" sigs.k8s.io/controller-runtime | awk -F'[v.]' '{printf "release-%d.%d", $$2, $$3}')
#ENVTEST_K8S_VERSION is the version of Kubernetes to use for setting up ENVTEST binaries (i.e. 1.31)
ENVTEST_K8S_VERSION ?= $(shell go list -m -f "{{ .Version }}" k8s.io/api | awk -F'[v.]' '{printf "1.%d", $$3}')
GOLANGCI_LINT_VERSION ?= v2.1.0

.PHONY: kustomize
kustomize: $(KUSTOMIZE) ## Download kustomize locally if necessary.
$(KUSTOMIZE): $(LOCALBIN)
	$(call go-install-tool,$(KUSTOMIZE),sigs.k8s.io/kustomize/kustomize/v5,$(KUSTOMIZE_VERSION))

.PHONY: controller-gen
controller-gen: $(CONTROLLER_GEN) ## Download controller-gen locally if necessary.
$(CONTROLLER_GEN): $(LOCALBIN)
	$(call go-install-tool,$(CONTROLLER_GEN),sigs.k8s.io/controller-tools/cmd/controller-gen,$(CONTROLLER_TOOLS_VERSION))

.PHONY: setup-envtest
setup-envtest: envtest ## Download the binaries required for ENVTEST in the local bin directory.
	@echo "Setting up envtest binaries for Kubernetes version $(ENVTEST_K8S_VERSION)..."
	@$(ENVTEST) use $(ENVTEST_K8S_VERSION) --bin-dir $(LOCALBIN) -p path || { \
		echo "Error: Failed to set up envtest binaries for version $(ENVTEST_K8S_VERSION)."; \
		exit 1; \
	}

.PHONY: envtest
envtest: $(ENVTEST) ## Download setup-envtest locally if necessary.
$(ENVTEST): $(LOCALBIN)
	$(call go-install-tool,$(ENVTEST),sigs.k8s.io/controller-runtime/tools/setup-envtest,$(ENVTEST_VERSION))

.PHONY: golangci-lint
golangci-lint: $(GOLANGCI_LINT) ## Download golangci-lint locally if necessary.
$(GOLANGCI_LINT): $(LOCALBIN)
	$(call go-install-tool,$(GOLANGCI_LINT),github.com/golangci/golangci-lint/v2/cmd/golangci-lint,$(GOLANGCI_LINT_VERSION))
# go-install-tool will 'go install' any package with custom target and name of binary, if it doesn't exist
# $1 - target path with name of binary
# $2 - package url which can be installed
# $3 - specific version of package
define go-install-tool
@[ -f "$(1)-$(3)" ] || { \
set -e; \
package=$(2)@$(3) ;\
echo "Downloading $${package}" ;\
rm -f $(1) || true ;\
GOBIN=$(LOCALBIN) go install $${package} ;\
mv $(1) $(1)-$(3) ;\
} ;\
ln -sf $(1)-$(3) $(1)
endef
