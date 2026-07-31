#!/usr/bin/env bash
set -o errexit

# 1. Install system dependencies (ffmpeg)
echo "Installing ffmpeg..."
apt-get update
apt-get install -y ffmpeg

# 2. Install Node dependencies
npm install

# 3. Download latest yt-dlp
echo "Downloading yt-dlp..."
mkdir -p ./bin
wget -O ./bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod a+rx ./bin/yt-dlp
echo "yt-dlp ready."
