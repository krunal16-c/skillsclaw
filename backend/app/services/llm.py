"""Text LLM provider abstraction for workflow synthesis and SKILL.md generation."""

from __future__ import annotations

import httpx
import time
from app.config import settings


class LLMProviderError(RuntimeError):
    """Raised when an upstream model provider request fails."""


def _extract_anthropic_text(response) -> str:
    texts: list[str] = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            texts.append(text)
    return "\n".join(texts).strip()


def _generate_with_anthropic(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    import anthropic

    if not settings.ANTHROPIC_API_KEY:
        raise LLMProviderError(
            "ANTHROPIC_API_KEY is missing. Set LLM_PROVIDER=ollama or provide a valid Anthropic key."
        )

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        kwargs = {
            "model": settings.ANTHROPIC_TEXT_MODEL,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        response = client.messages.create(**kwargs)
        text = _extract_anthropic_text(response)
        if not text:
            raise LLMProviderError("Anthropic returned an empty response.")
        return text
    except Exception as exc:
        message = str(exc)
        if "credit balance is too low" in message.lower():
            raise LLMProviderError(
                "Anthropic credits are too low. Switch to LLM_PROVIDER=ollama in .env or add Anthropic credits."
            ) from exc
        raise LLMProviderError(f"Anthropic request failed: {message}") from exc


def _generate_with_ollama(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    url = f"{base_url}/api/generate"
    payload: dict = {
        "model": settings.OLLAMA_TEXT_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    if system:
        payload["system"] = system

    timeout = httpx.Timeout(
        connect=10.0,
        read=float(settings.OLLAMA_TIMEOUT_SECONDS),
        write=30.0,
        pool=30.0,
    )

    max_attempts = max(1, settings.OLLAMA_MAX_RETRIES + 1)
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
            data = response.json()
            text = (data.get("response") or "").strip()
            if not text:
                raise LLMProviderError("Ollama returned an empty response.")
            return text
        except httpx.ReadTimeout as exc:
            last_exc = exc
            if attempt < max_attempts:
                time.sleep(min(2 ** attempt, 8))
                continue
            raise LLMProviderError(
                "Ollama request timed out while generating text. "
                "Increase OLLAMA_TIMEOUT_SECONDS or use a smaller/faster model."
            ) from exc
        except Exception as exc:
            last_exc = exc
            break

    raise LLMProviderError(f"Ollama request failed: {last_exc}")


def generate_text(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    provider = settings.LLM_PROVIDER.lower().strip()

    if provider == "anthropic":
        return _generate_with_anthropic(
            prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    if provider == "ollama":
        return _generate_with_ollama(
            prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    raise LLMProviderError(
        f"Unknown LLM_PROVIDER: {settings.LLM_PROVIDER!r}. Use 'anthropic' or 'ollama'."
    )
