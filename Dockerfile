FROM node:20-slim

# Install dependencies for Baileys (Sharp, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create auth states directory
RUN mkdir -p /app/auth_states

# Expose health endpoint (optional - your app can provide one)
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV WASP_AUTH_DIR=/app/auth_states

# Run your application
# Default command - override in docker-compose
CMD ["node", "dist/index.js"]
