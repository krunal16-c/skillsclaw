from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.api import auth, upload, jobs, skills, marketplace


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="SkillsClaw API",
    description="Convert workflow videos into Claude Code SKILL.md files",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(jobs.router)
app.include_router(skills.router)
app.include_router(marketplace.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "skillsclaw-api"}
