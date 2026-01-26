# Stage 1: Build
FROM node:20-bookworm as builder

# Install Rust
RUN apt-get update && apt-get install -y curl build-essential
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
COPY package.json package-lock.json ./
COPY core/Cargo.toml core/Cargo.lock ./core/
COPY core/src ./core/src
COPY core/build.rs ./core/
COPY scripts ./scripts
COPY src ./src
COPY types ./types
COPY tsconfig.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Build Node.js code
RUN npm run build

# Build Rust Core
# This usually happens during npm install via prepare/build scripts if configured,
# but we can explicitly run it to be sure.
RUN npm run build:core

# Stage 2: Production Runtime
FROM node:20-bookworm-slim

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/qhttpx-core.*.node ./core/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set environment to production
ENV NODE_ENV=production
ENV RUST_LOG=info

# Default command (can be overridden)
CMD ["node", "dist/index.js"]
