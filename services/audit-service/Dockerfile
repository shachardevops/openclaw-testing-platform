FROM rust:1.83-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/audit-service /usr/local/bin/
EXPOSE 4002
CMD ["audit-service"]
