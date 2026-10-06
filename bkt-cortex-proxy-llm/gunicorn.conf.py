"""Gunicorn configuration for production deployment."""
import multiprocessing
import os

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

# Server socket
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8010")
backlog = 2048

# Worker processes
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
# Usando gevent como worker_class para evitar problemas de fork en macOS
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
timeout = 300
keepalive = 2

# Configuración específica para evitar el error de fork en macOS
# Esta configuración ayuda a evitar el error de NSMutableString
preload_app = True
reuse_port = True

# Process naming
proc_name = "llm_interface"

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# Logging - usa "-" para stderr/stdout
errorlog = "-"
accesslog = "-"
# Configura el nivel mínimo para evitar logs innecesarios de Gunicorn
loglevel = "error"
# Desactiva captura para evitar redirecciones
capture_output = False

# Process management
reload = os.getenv("GUNICORN_RELOAD", "false").lower() == "true"

# Optimize for long-running requests (LLM calls)
threads = int(os.getenv("GUNICORN_THREADS", "4"))
max_requests = 1000
max_requests_jitter = 50

# Server hooks
def on_starting(server):
    """
    Called just before the master process is initialized.
    """
    # Set env var to avoid fork issues in macOS
    os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"


def on_reload(server):
    """
    Called before code is reloaded.
    """
    pass


def when_ready(server):
    """
    Called just after the server is started.
    """
    print(f"Gunicorn server is ready. Listening at: {bind}")
    print(f"Worker class: {worker_class}")


def on_exit(server):
    """
    Called just before exiting.
    """
    print("Shutting down Gunicorn server")