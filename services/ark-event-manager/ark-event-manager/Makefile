.PHONY: generate-models
generate-models:
	@echo "Generating Pydantic models from protobuf..."
	uv run python generate_event_model.py

.PHONY: install
install:
	uv sync

.PHONY: run
run:
	uv run python -m ark_event_manager

