#!/bin/bash
set -e

echo "=== SysCraft Deployment ==="

# Configuration
CONTAINER_NAME="syscraft"
IMAGE_NAME="localhost/syscraft:latest"
HOST_PORT=4000
DATA_DIR="/opt/syscraft/data"
PROJECT_DIR="/home/agents/rh-sat/syscraft"

# Create data directory
echo "[1/6] Creating data directory..."
mkdir -p "$DATA_DIR"

# Build container image
echo "[2/6] Building container image..."
cd "$PROJECT_DIR"
podman build -t "$IMAGE_NAME" .

# Stop and remove existing container
echo "[3/6] Stopping existing container..."
podman stop "$CONTAINER_NAME" 2>/dev/null || true
podman rm "$CONTAINER_NAME" 2>/dev/null || true

# Run container
echo "[4/6] Starting container..."
podman run -d \
  --name "$CONTAINER_NAME" \
  --restart always \
  -p ${HOST_PORT}:4000 \
  -v ${DATA_DIR}:/app/data:Z \
  --env-file "${PROJECT_DIR}/.env" \
  --network host \
  --cap-add NET_RAW \
  "$IMAGE_NAME"

# Wait for startup
echo "[5/6] Waiting for startup..."
sleep 5

# Health check
echo "[6/6] Health check..."
if curl -sf http://localhost:${HOST_PORT}/api/health > /dev/null 2>&1; then
  echo "✓ SysCraft is running at http://satellite.ailab.local:${HOST_PORT}"
else
  echo "⚠ Container started but health check failed. Check logs:"
  echo "  podman logs $CONTAINER_NAME"
fi

echo ""
echo "=== Deployment complete ==="
echo "URL: http://satellite.ailab.local:${HOST_PORT}"
echo "Login: admin / syscraft"
echo ""
echo "Useful commands:"
echo "  podman logs -f $CONTAINER_NAME    # View logs"
echo "  podman restart $CONTAINER_NAME    # Restart"
echo "  podman stop $CONTAINER_NAME       # Stop"
