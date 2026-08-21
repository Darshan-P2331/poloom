"""
Poloom — FastAPI application entry point.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers.pipelines import router as pipelines_router
from app.services.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown events.

    Initializes the SQLite database tables and ensures runtime directories
    for pipelines and data exist.

    Args:
        app (FastAPI): The running FastAPI application instance.

    Yields:
        None: Hands over control during the application runtime lifecycle.
    """
    await init_db()
    # Ensure directories exist
    Path("./pipelines").mkdir(exist_ok=True)
    Path("./data").mkdir(exist_ok=True)
    yield


app = FastAPI(
    title="Poloom",
    description="YAML-driven ETL framework powered by Polars",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(pipelines_router)

# Serve frontend static files in production
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        """Serve compiled static assets or fallback to index.html for Single Page Application routing.

        Args:
            full_path (str): The requested sub-path route.

        Returns:
            FileResponse: The requested static file if found, otherwise the SPA root index.html.
        """
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
