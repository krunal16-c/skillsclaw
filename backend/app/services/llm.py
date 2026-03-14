"""Text LLM provider abstraction for workflow synthesis and SKILL.md generation."""

from __future__ import annotations

import httpx
import time
from app.config import settings


class LLMProviderError(RuntimeError):
    """Raised when an upstream model provider request fails."""


SUPPORTED_LLM_PROVIDERS = {"anthropic", "openai", "gemini", "openrouter", "ollama"}


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
    model: str,
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
            "model": model,
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


def _generate_with_openai_compatible(
    prompt: str,
    *,
    base_url: str,
    api_key: str,
    model: str,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    extra_headers: dict[str, str] | None = None,
) -> str:
    if not api_key:
        raise LLMProviderError("Missing API key for selected LLM provider.")

    url = f"{base_url.rstrip('/')}/chat/completions"
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    timeout = httpx.Timeout(
        connect=10.0,
        read=float(settings.LLM_REQUEST_TIMEOUT_SECONDS),
        write=30.0,
        pool=30.0,
    )

    max_attempts = max(1, settings.LLM_MAX_RETRIES + 1)
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            text = data["choices"][0]["message"]["content"].strip()
            if not text:
                raise LLMProviderError("Provider returned an empty response.")
            return text
        except httpx.ReadTimeout as exc:
            last_exc = exc
            if attempt < max_attempts:
                time.sleep(min(2 ** attempt, 8))
                continue
            raise LLMProviderError("LLM request timed out.") from exc
        except Exception as exc:
            last_exc = exc
            break

    raise LLMProviderError(f"LLM request failed: {last_exc}")


def _generate_with_gemini(
    prompt: str,
    *,
    model: str,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    if not settings.GOOGLE_API_KEY:
        raise LLMProviderError("GOOGLE_API_KEY is missing.")

    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={settings.GOOGLE_API_KEY}"
    )

    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }

    timeout = httpx.Timeout(
        connect=10.0,
        read=float(settings.LLM_REQUEST_TIMEOUT_SECONDS),
        write=30.0,
        pool=30.0,
    )

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise LLMProviderError("Gemini returned no candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "\n".join(p.get("text", "") for p in parts).strip()
        if not text:
            raise LLMProviderError("Gemini returned an empty response.")
        return text
    except Exception as exc:
        raise LLMProviderError(f"Gemini request failed: {exc}") from exc


def _generate_with_ollama(
    prompt: str,
    *,
    model: str,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    url = f"{base_url}/api/generate"
    payload: dict = {
        "model": model,
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
    provider: str | None = None,
    model: str | None = None,
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    active_provider = (provider or settings.LLM_PROVIDER).lower().strip()

    if active_provider not in SUPPORTED_LLM_PROVIDERS:
        raise LLMProviderError(
            f"Unknown LLM provider: {active_provider!r}. Supported: {', '.join(sorted(SUPPORTED_LLM_PROVIDERS))}."
        )

    if active_provider == "anthropic":
        return _generate_with_anthropic(
            prompt,
            model=model or settings.ANTHROPIC_TEXT_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    if active_provider == "openai":
        return _generate_with_openai_compatible(
            prompt,
            base_url="https://api.openai.com/v1",
            api_key=settings.OPENAI_API_KEY,
            model=model or settings.OPENAI_TEXT_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    if active_provider == "openrouter":
        return _generate_with_openai_compatible(
            prompt,
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=settings.OPENROUTER_API_KEY,
            model=model or settings.OPENROUTER_TEXT_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            extra_headers={"HTTP-Referer": "https://skillsclaw.local", "X-Title": "SkillsClaw"},
        )

    if active_provider == "gemini":
        return _generate_with_gemini(
            prompt,
            model=model or settings.GEMINI_TEXT_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    if active_provider == "ollama":
        return _generate_with_ollama(
            prompt,
            model=model or settings.OLLAMA_TEXT_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    raise LLMProviderError("Unsupported provider.")
