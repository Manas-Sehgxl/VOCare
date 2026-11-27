FROM docker.io/library/golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY server/ server/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bol-opd ./server

FROM docker.io/library/alpine:3.20
RUN adduser -D -u 10001 app && mkdir -p /app/data && chown app /app/data
WORKDIR /app
COPY --from=build /bol-opd /app/bol-opd
COPY dist/ /app/dist/
USER app
ENV PORT=3000 STATIC_DIR=/app/dist DATA_FILE=/app/data/records.json
EXPOSE 3000
CMD ["/app/bol-opd"]
