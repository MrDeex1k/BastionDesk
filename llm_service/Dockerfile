FROM ghcr.io/astral-sh/uv:0.12.9-python3.13-trixie-slim AS builder

WORKDIR /app

ENV UV_HTTP_TIMEOUT=300 \
    UV_HTTP_RETRIES=5 \
    UV_PROJECT_ENVIRONMENT=/app/.venv

COPY llm_service/pyproject.toml ./pyproject.toml
COPY llm_service/uv.lock ./uv.lock

RUN uv sync --locked --no-install-project

COPY llm_service/ .
COPY proto ./proto

RUN uv sync --locked

RUN chmod +x start.sh

FROM ghcr.io/astral-sh/uv:0.12.9-python3.13-trixie-slim AS runtime

WORKDIR /app

ENV UV_HTTP_TIMEOUT=300 \
    UV_HTTP_RETRIES=5 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_CACHE_DIR=/tmp/uv-cache \
    PATH=/app/.venv/bin:$PATH \
    HF_HOME=/tmp/huggingface \
    TRANSFORMERS_CACHE=/tmp/huggingface

RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app \
    && mkdir -p /tmp/uv-cache /tmp/huggingface \
    && chown -R app:app /tmp/uv-cache /tmp/huggingface

COPY --from=builder --chown=app:app /app /app
RUN chown -R app:app /app

USER app

EXPOSE 8888 8443

HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=10 \
  CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8888/health').status == 200 else 1)"

CMD ["./start.sh"]
