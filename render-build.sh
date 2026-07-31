#!/usr/bin/env bash
set -o errexit

# 1. Install Node dependencies
npm install

# 2. Download latest yt-dlp
echo "Downloading yt-dlp..."
mkdir -p ./bin
wget -q -O ./bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod 755 ./bin/yt-dlp
echo "yt-dlp ready."

# Test yt-dlp to ensure it executes properly
echo "Testing yt-dlp..."
./bin/yt-dlp --version

# 3. Download static ffmpeg
echo "Downloading ffmpeg..."
wget -q -O /tmp/ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf /tmp/ffmpeg.tar.xz -C ./bin --strip-components=1
chmod 755 ./bin/ffmpeg
chmod 755 ./bin/ffprobe
echo "ffmpeg ready."
