#!/bin/bash
set -euo pipefail

mkdir -p generated
touch generated/__init__.py
uv run python -m grpc_tools.protoc \
	-I./proto \
	--python_out=./generated \
	--grpc_python_out=./generated \
	./proto/incident_classifier.proto

export PYTHONPATH="/app/generated:/app:${PYTHONPATH:-}"

exec uv run uvicorn main:app --host 0.0.0.0 --port 8888
