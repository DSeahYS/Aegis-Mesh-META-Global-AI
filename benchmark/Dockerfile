FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV CPU_LIMIT=1.0
ENV MEMORY_LIMIT=512m

CMD ["sh", "-c", "python profile_memory.py && python run_benchmark.py && python validate_swap.py && python generate_report.py"]
