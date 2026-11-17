FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Europe/Bratislava

RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY collector ./collector

RUN useradd --create-home --uid 1000 collector && mkdir -p /app/data && chown collector /app/data
USER collector

EXPOSE 8000
CMD ["python", "-m", "collector", "web", "--host", "0.0.0.0", "--port", "8000"]
