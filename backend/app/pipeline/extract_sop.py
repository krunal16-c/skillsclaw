"""
SOP text extraction pipeline step.

Supports: PDF, DOCX, plain text (.txt), Markdown (.md)
Downloads the file from MinIO, extracts plain text, stores in job.sop_text.
"""

import io


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    return Session()


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def _extract_docx(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _extract_text(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def extract_sop_text(job_id: str) -> str:
    from app.models.job import Job
    from app.services.r2 import download_bytes

    session = _get_sync_session()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        if not job.r2_key:
            raise ValueError(f"Job {job_id} has no file — use the paste endpoint for raw text")

        data = download_bytes(job.r2_key)
        filename = (job.original_filename or "").lower()

        if filename.endswith(".pdf"):
            text = _extract_pdf(data)
        elif filename.endswith(".docx"):
            text = _extract_docx(data)
        else:
            # .txt, .md, or anything else — treat as plain text
            text = _extract_text(data)

        text = text.strip()
        if not text:
            raise ValueError("Could not extract any text from the uploaded document")

        job.sop_text = text
        session.commit()
        return text
    finally:
        session.close()
