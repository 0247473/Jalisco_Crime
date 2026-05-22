# Stage 1: Build stage
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /app

# Install dependencies in a separate layer for better caching
COPY requirements.txt .

# Install dependencies (no cache to reduce image size)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime stage
FROM python:3.11-slim

# Fix: Create group and user with explicit numeric ID 1000
RUN groupadd -g 1000 -r appuser && useradd -u 1000 -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application code
COPY main.py .

# Copy your local data folder into the container
COPY ./data/ /app/data/

# Fix: Grant permissions explicitly to numeric ID 1000
RUN mkdir -p /app/data && chown -R 1000:1000 /app

# Fix: Switch to the numeric user ID so Kubernetes can verify non-root compliance
USER 1000

# Expose port 8000
EXPOSE 8000

# Health check to verify container is running properly
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]