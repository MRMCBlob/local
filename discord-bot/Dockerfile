# Use the official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Install build dependencies for native modules like better-sqlite3
RUN apk add --no-cache python3 make g++

# Install pnpm globally
RUN npm install -g pnpm

# Copy package.json and workspace files
COPY package.json ./
COPY pnpm-workspace.yaml ./

# Install dependencies (remove frozen-lockfile since we don't have a lock file)
RUN pnpm install --prod

# Copy the rest of the application code
COPY src/ ./src/
COPY config.json ./
COPY fishing_config.json ./

# Create data directory for SQLite database with proper permissions
RUN mkdir -p /app/data

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001 -G nodejs

# Change ownership of the app directory to the discordbot user
RUN chown -R discordbot:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 777 /app/data

# Switch to non-root user
USER discordbot

# Set environment variable for production
ENV NODE_ENV=production

# Health check to ensure the bot is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f "node src/index.js" || exit 1

# Command to run the application
CMD ["pnpm", "start"]