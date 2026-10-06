FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY bkt_integration_service_python ./bkt_integration_service_python

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uv", "run", "litestar", "--app", "bkt_integration_service_python.main:app", "run", "--host", "0.0.0.0", "--port", "8000"]
