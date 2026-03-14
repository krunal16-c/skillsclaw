"""
S3-compatible storage client.
Backed by MinIO in local dev, swappable with any S3-compatible service in prod.
"""

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from urllib.parse import urlparse, urlunparse
from app.config import settings

_s3_client = None


def _to_public_url(url: str) -> str:
    """Swap internal S3 host with public host for browser-safe presigned URLs."""
    public_base = settings.S3_PUBLIC_URL
    if not public_base:
        return url

    parsed_url = urlparse(url)
    parsed_public = urlparse(public_base)
    if not parsed_public.scheme or not parsed_public.netloc:
        return url

    return urlunparse(
        (
            parsed_public.scheme,
            parsed_public.netloc,
            parsed_url.path,
            parsed_url.params,
            parsed_url.query,
            parsed_url.fragment,
        )
    )


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name="us-east-1",  # MinIO ignores this but boto3 requires it
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


# Alias used in vision.py
r2_client = get_s3_client


def generate_presigned_upload_url(
    key: str, content_type: str, max_size: int
) -> dict:
    client = get_s3_client()
    conditions = [
        ["content-length-range", 1, max_size],
        {"Content-Type": content_type},
    ]
    response = client.generate_presigned_post(
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=conditions,
        ExpiresIn=3600,
    )
    return {
        "url": _to_public_url(response["url"]),
        "fields": response["fields"],
        "key": key,
    }


def generate_presigned_download_url(key: str, expires: int = 3600) -> str:
    client = get_s3_client()
    internal_url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
        ExpiresIn=expires,
    )
    return _to_public_url(internal_url)


def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    client = get_s3_client()
    client.put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def download_bytes(key: str) -> bytes:
    client = get_s3_client()
    response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    return response["Body"].read()


def delete_object(key: str) -> None:
    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except ClientError:
        pass


def object_exists(key: str) -> bool:
    client = get_s3_client()
    try:
        client.head_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
        return True
    except ClientError:
        return False
