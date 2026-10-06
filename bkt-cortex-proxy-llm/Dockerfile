# Use official Python 3.12 image
FROM imagerepository.tc.vncloudlab.com/agentic-docker-thirdparties/python:3.12-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    UV_HOME=/usr/local

# Install system dependencies and uv
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     curl \
#     && curl -LsSf https://astral.sh/uv/install.sh | sh \
#     && apt-get autoremove -y && apt-get clean -y \
#     && rm -rf /var/lib/apt/lists/*


# Set working directory
WORKDIR /app

# Instalar uv
RUN pip install --no-cache-dir uv

# Copy only necessary build files first
COPY pyproject.toml .
COPY gunicorn.conf.py .
COPY README.md .

# Install dependencies using uv
RUN uv venv /app/.venv && \
    uv pip install --no-cache-dir -e .


# Copy application code excluding non-essential parts
COPY src ./src
COPY src/bktcortexproxyllm/services/orgs.txt ./orgs.txt
COPY src/bktcortexproxyllm/services/users.txt ./users.txt
# Cleanup patterns that might trigger security warnings
RUN find . -type d -name '__pycache__' -exec rm -rf {} + && \
    find . -type f -name '*.py[co]' -delete

# Expose the application port
EXPOSE 8010

ENV PATH="/app/.venv/bin:$PATH"

# Run Gunicorn with Uvicorn worker
CMD ["gunicorn", "-c", "gunicorn.conf.py", "src.bktcortexproxyllm.main:app"]