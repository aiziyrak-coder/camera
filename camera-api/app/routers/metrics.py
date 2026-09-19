"""Prometheus /metrics endpointi."""

from fastapi import APIRouter

router = APIRouter(tags=["metrics"])
