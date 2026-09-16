FROM golang:1.24-alpine

ENV CGO_ENABLED=0 \
    GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct

RUN go install github.com/air-verse/air@v1.61.7

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o /tmp/warmup . && rm -f /tmp/warmup

EXPOSE 3001

CMD ["air", "-c", "/app/.air.toml"]
