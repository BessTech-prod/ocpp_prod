FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1
RUN pip install --upgrade pip

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

COPY web ./web


VOLUME ["/data"]

# Exponera REST (8000) och OCPP-WS (9000)
EXPOSE 8000 9000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
