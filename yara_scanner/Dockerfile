FROM ghcr.io/astral-sh/uv:0.13.9-python3.13-trixie-slim

WORKDIR /app
RUN uv pip install --system --only-binary :all: yara-python==4.5.4
COPY scanner.py /app/scanner.py
USER 65532:65532
CMD ["python", "-B", "/app/scanner.py"]
