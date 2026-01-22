FROM python:3.11-slim

WORKDIR /app

# Install git for gitpython
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port
EXPOSE 8000

# Start server
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
