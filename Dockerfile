# Use a lightweight Node.js base image
FROM node:18-slim

# Install ffmpeg, wget, and python3 (yt-dlp often needs python to bootstrap JS challenges)
RUN apt-get update && apt-get install -y ffmpeg wget python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package.json and install Node dependencies
COPY package.json ./
RUN npm install

# Download the latest yt-dlp binary and make it executable
RUN mkdir -p ./bin && \
    wget -q -O ./bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod 755 ./bin/yt-dlp

# Copy the rest of your app code (proxy.js, etc.)
COPY . .

# Expose the port your proxy.js uses
ENV PORT=10000
EXPOSE 10000

# Start the app
CMD [ "node", "proxy.js" ]
