#!/usr/bin/env bash
set -euo pipefail

MODELS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/models"
mkdir -p "$MODELS_DIR"

echo "=========================================================="
echo " EvidGraph-Desktop: Local Offline Model Downloader"
echo " Target Directory: $MODELS_DIR"
echo "=========================================================="

# 1. Qwen2-VL-2B-Instruct Quantized GGUF (~986 MB)
MODEL_URL="https://huggingface.co/bartowski/Qwen2-VL-2B-Instruct-GGUF/resolve/main/Qwen2-VL-2B-Instruct-Q4_K_M.gguf"
MODEL_FILE="$MODELS_DIR/Qwen2-VL-2B-Instruct-Q4_K_M.gguf"

if [ -f "$MODEL_FILE" ] && [ $(wc -c < "$MODEL_FILE") -gt 900000000 ]; then
    echo "[✓] Qwen2-VL-2B-Instruct-Q4_K_M.gguf already downloaded."
else
    echo "[*] Downloading Qwen2-VL-2B-Instruct-Q4_K_M.gguf (~986 MB)..."
    curl -L -C - --progress-bar "$MODEL_URL" -o "$MODEL_FILE"
    echo "[✓] Successfully downloaded Qwen2-VL-2B-Instruct-Q4_K_M.gguf"
fi

# 2. Multimodal Vision Projector GGUF (~1.33 GB)
MMPROJ_URL="https://huggingface.co/bartowski/Qwen2-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen2-VL-2B-Instruct-f16.gguf"
MMPROJ_FILE="$MODELS_DIR/mmproj-Qwen2-VL-2B-Instruct-f16.gguf"

if [ -f "$MMPROJ_FILE" ] && [ $(wc -c < "$MMPROJ_FILE") -gt 1300000000 ]; then
    echo "[✓] mmproj-Qwen2-VL-2B-Instruct-f16.gguf already downloaded."
else
    echo "[*] Downloading mmproj-Qwen2-VL-2B-Instruct-f16.gguf (~1.33 GB)..."
    curl -L -C - --progress-bar "$MMPROJ_URL" -o "$MMPROJ_FILE"
    echo "[✓] Successfully downloaded mmproj-Qwen2-VL-2B-Instruct-f16.gguf"
fi

echo "=========================================================="
echo " All local models verified and ready for offline inference!"
ls -lh "$MODELS_DIR"
echo "=========================================================="
