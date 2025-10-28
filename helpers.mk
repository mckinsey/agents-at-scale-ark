
# Enable secondary expansion for deferred variable resolution in dependencies
.SECONDEXPANSION:

# Define build root as absolute path
BUILD_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# Define output directory
OUT := $(BUILD_ROOT)/out

# Define Python command
PYTHON := $(shell command -v python3 || command -v python)

# Define build PATH
BUILD_EXTRA_PATH := $(PATH)

# Add brew prefix to PATH on macOS
ifeq ($(shell uname -s),Darwin)
	BUILD_EXTRA_PATH := $(shell brew --prefix openjdk)/bi:$(BUILD_EXTRA_PATH)
endif

# ANSI color codes for help output
COLOR_RESET := \033[00m
COLOR_GREEN := \033[1;32m
COLOR_CYAN := \033[1;36m
COLOR_YELLOW := \033[1;33m
COLOR_GREY := \033[0;90m

# Define clean targets list
CLEAN_TARGETS :=
INSTALL_TARGETS :=
UNINSTALL_TARGETS :=

# Create output directory
$(OUT):
	@mkdir -p $(OUT)

# Common stamp file pattern for tracking build steps
define STAMP_TARGET
$(OUT)/$(1)/stamp-$(2): $(3) | $(OUT)
	@mkdir -p $$(dir $$@)
	$(4)
	@touch $$@
endef


# Common pattern for building binaries
define BUILD_BINARY
$(OUT)/$(1)/$(2): $(3) | $(OUT)
	@mkdir -p $$(dir $$@)
	$(4)
endef

# Pattern for dependency management
define INSTALL_DEPS
$(OUT)/$(1)/stamp-deps: $(2) | $(OUT)
	@mkdir -p $$(dir $$@)
	$(3)
	@touch $$@
endef

# Clean stamp files for a service - removes all stamp files but keeps artifacts
define CLEAN_STAMPS_TEMPLATE
$(1)-clean-stamps: # HELP: Remove $(1) stamp files (forces rebuild without removing artifacts)
	@rm -f $(OUT)/$(1)/stamp-*
endef

# Include child fragments
include $(BUILD_ROOT)/lib/lib.mk
include $(BUILD_ROOT)/services/services.mk
include $(BUILD_ROOT)/tools/tools.mk
include $(BUILD_ROOT)/images/images.mk

