#!/usr/bin/env bash
set -o errexit

# 1. Install Node dependencies
npm install

# 2. Download latest yt-dlp
echo "Downloading yt-dlp..."
mkdir -p ./bin
wget -O ./bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod a+rx ./bin/yt-dlp
echo "yt-dlp ready."

# 3. Download static ffmpeg
echo "Downloading ffmpeg..."
# Download the static build archive
wget -O /tmp/ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
# Extract it into the bin folder
tar -xf /tmp/ffmpeg.tar.xz -C ./bin --strip-components=1
chmod a+rx ./bin/ffmpeg
chmod a+rx ./bin/ffprobe
echo "ffmpeg ready."
