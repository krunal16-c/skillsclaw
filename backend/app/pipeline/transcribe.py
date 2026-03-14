import os
import tempfile
import json
from app.services.r2 import download_bytes


def transcribe_video(job_id: str) -> str:
    from faster_whisper import WhisperModel
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.models.job import Job

    session = _get_sync_session()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        video_bytes = download_bytes(job.r2_key)

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_file:
            tmp_file.write(video_bytes)
            tmp_path = tmp_file.name

        try:
            model = WhisperModel("base", device="cpu", compute_type="int8")
            segments_iter, info = model.transcribe(
                tmp_path,
                word_timestamps=True,
                beam_size=5,
            )

            segments_list = []
            full_text_parts = []

            for segment in segments_iter:
                seg_data = {
                    "start": round(segment.start, 3),
                    "end": round(segment.end, 3),
                    "text": segment.text.strip(),
                    "words": [
                        {
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "word": w.word,
                            "probability": round(w.probability, 4),
                        }
                        for w in (segment.words or [])
                    ],
                }
                segments_list.append(seg_data)
                full_text_parts.append(segment.text.strip())

            full_transcript = " ".join(full_text_parts)
            duration = info.duration if hasattr(info, "duration") else None

            job.transcript = full_transcript
            job.transcript_segments = segments_list
            if duration:
                job.duration_seconds = duration
            session.commit()

            return full_transcript
        finally:
            os.unlink(tmp_path)
    finally:
        session.close()


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    return Session()
