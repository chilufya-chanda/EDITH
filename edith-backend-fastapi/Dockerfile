# Hugging Face Spaces (Docker SDK) expects the app to listen on port 7860.
# This image works unmodified on any other Docker host too — just map
# whatever port you want to 7860, or override with the PORT env var below.

FROM python:3.11-slim

# libgl1 + libglib2.0-0: required by opencv even in "headless" mode for
# some codecs; kept minimal deliberately for a fast, small image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=7860
EXPOSE 7860

# Single worker: Hugging Face Spaces' free CPU tier has limited RAM, and a
# single warmed-once worker avoids loading the ArcFace model multiple
# times. On your own VM with more headroom, add --workers based on cores.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
