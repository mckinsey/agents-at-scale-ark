# Service name
ARK_TOOLS_SERVICE_NAME := ark-tools
ARK_TOOLS_SERVICE_DIR := images/$(ARK_TOOLS_SERVICE_NAME)
ARK_TOOLS_OUT := $(OUT)/$(ARK_TOOLS_SERVICE_NAME)

# Service-specific variables
ARK_TOOLS_IMAGE := agents-at-scale/ark-tools
ARK_TOOLS_TAG ?= alpine

# Pre-calculate stamp path
ARK_TOOLS_STAMP_DOCKER := $(ARK_TOOLS_OUT)/stamp-docker

# Define phony targets
.PHONY: $(ARK_TOOLS_SERVICE_NAME)-docker $(ARK_TOOLS_SERVICE_NAME)-push

# Docker build target
$(ARK_TOOLS_SERVICE_NAME)-docker: $(ARK_TOOLS_STAMP_DOCKER) # HELP: Build ark-tools Docker image with all CLI tools
$(ARK_TOOLS_STAMP_DOCKER): $(ARK_TOOLS_SERVICE_DIR)/Dockerfile | $(OUT)
	@mkdir -p $(dir $@)
	docker build -t $(ARK_TOOLS_IMAGE):$(ARK_TOOLS_TAG) -f $(ARK_TOOLS_SERVICE_DIR)/Dockerfile .
	@touch $@

# Push target
$(ARK_TOOLS_SERVICE_NAME)-push: $(ARK_TOOLS_STAMP_DOCKER) # HELP: Push ark-tools Docker image
	docker push $(ARK_TOOLS_IMAGE):$(ARK_TOOLS_TAG)
