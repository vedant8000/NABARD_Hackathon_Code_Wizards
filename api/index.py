"""Vercel serverless entrypoint. Exposes the FastAPI ASGI app.

The whole backend lives in mira/backend; we add it to sys.path and export
`app`, which the Vercel Python runtime serves for every /api/* request.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mira", "backend"))

from app.main import app  # noqa: E402,F401
