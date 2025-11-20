.DEFAULT_GOAL := help

# this must be first, pull in our macros
include helpers.mk

STAMP_QUICKSTART=$(OUT)/stamp-quickstart

# Put any local make targets you want to have at the top level but not commit
# in local.mk
include local.mk
local.mk:
	touch $@

# Find all makefiles that contain help targets
HELP_MAKEFILES := Makefile $(wildcard **/build.mk) $(wildcard **/*.mk)

# Generate help.mk when makefiles change
help.mk: $(HELP_MAKEFILES)
	@$(PYTHON) scripts/show-help.py --makefile > $@

# Include the generated help makefile
-include help.mk

.PHONY: docs
docs: # run the documentation site with live-reload
	(cd docs && npm install && npm run dev)

.PHONY: quickstart
quickstart: # HELP: get everything up and running and ready to go
	@./scripts/quickstart.sh

quickstart-force: # Force quickstart to run
	@FORCE=true ./scripts/quickstart.sh -f

.PHONY: quickstart-reconfigure-default-model
quickstart-reconfigure-default-model: # HELP: reconfigure the default model with fresh credentials
	@./scripts/quickstart-reconfigure-default-model.sh

# NB: note that quickstart doesn't depend on this because we always want that to run as today
$(STAMP_QUICKSTART): | $(OUT)
	@./scripts/quickstart.sh
	touch $@

.PHONY: services  
services: # HELP: install and configure additional service capabilities one at a time
	@./scripts/services.sh

.PHONY: tools
tools: tools-build-all # HELP: build all tools

.PHONY: build-all
build-all: libs-build-all services-build-all tools-build-all # build all libraries, services, and tools

.PHONY: test-all
test-all: libs-test-all services-test-all tools-test-all # test all libraries, services, and tools


.PHONY: dashboard
dashboard: $(ARK_DASHBOARD_STAMP_INSTALL) # HELP: install ark dashboard

.PHONY: standup
standup: $(STAMP_QUICKSTART) $(ARK_DASHBOARD_STAMP_INSTALL) # HELP: standup the system from scratch
	@kubectl port-forward -n ark-system service/localhost-gateway-nginx 8080:80 > /dev/null 2>&1 &
	@sleep 3
	@NAMESPACE=ark-system PORT=8080 $(LOCALHOST_GATEWAY_SERVICE_DIR)/scripts/show-routes.sh


.PHONY: install-all
install-all: $(INSTALL_TARGETS) # install core services

.PHONY: uninstall-all
uninstall-all: $(UNINSTALL_TARGETS) # uninstall core services

.PHONY: clean
clean:
	@rm -rf $(OUT) $(CLEAN_TARGETS)

.PHONY: status
status: # HELP: Show status of localhost-gateway installation
	@helm list -n ark-system -f "localhost-gateway|nginx-gateway-fabric"
	@helm get metadata localhost-gateway -n ark-system 2>/dev/null || echo "localhost-gateway not installed"
