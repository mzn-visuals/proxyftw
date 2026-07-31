FROM node:18-slim

# Install ffmpeg, wget, python3, pip, and deno
RUN apt-get update && \
    apt-get install -y ffmpeg wget python3 python3-pip curl unzip && \
    curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package.json and install Node dependencies
COPY package.json ./
RUN npm install

# Install yt-dlp properly via pip
RUN pip3 install --break-system-packages -U yt-dlp

# Copy the rest of your app code
COPY . .

# Expose the port your proxy.js uses
ENV PORT=10000
EXPOSE 10000

# Start the app
CMD [ "node", "proxy.js" ]
