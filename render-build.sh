#!/usr/bin/env bash
set -o errexit

npm install

echo "Downloading yt-dlp..."
mkdir -p ./bin
wget -O ./bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod a+rx ./bin/yt-dlp
echo "yt-dlp ready."
