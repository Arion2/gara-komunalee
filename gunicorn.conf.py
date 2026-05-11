# gunicorn.conf.py  — Production configuration for 250 concurrent students
import multiprocessing

# Workers: (2 × CPU cores) + 1  — for a typical 4-core VPS this is 9
workers = (multiprocessing.cpu_count() * 2) + 1

# Use uvicorn async workers (required for FastAPI/asyncio)
worker_class = "uvicorn.workers.UvicornWorker"

# Each worker handles many concurrent requests via asyncio
worker_connections = 1000

bind = "0.0.0.0:8000"

# Timeouts
timeout         = 120
keepalive       = 5
graceful_timeout = 30

# Logging
accesslog  = "-"
errorlog   = "-"
loglevel   = "info"

# Restart workers after this many requests to prevent memory leaks
max_requests          = 1000
max_requests_jitter   = 100
