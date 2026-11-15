# Stage 1 uses Node to turn editable source into browser-ready files.
# The digest fixes the exact base image; it must be updated deliberately for patches.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build

WORKDIR /app

COPY package.json package-lock.json ./
# Install the exact dependency versions recorded in the lockfile.
RUN npm ci --no-audit --no-fund

COPY . .
ARG ATHLIMA_BUILD_VERSION=development
ARG ATHLIMA_BUILD_REVISION=
# Embed the release label, build the app, then authorize its exact inline scripts.
# Security-header hashes must be regenerated whenever the built HTML changes.
RUN node scripts/write-build-info.mjs src/platform/build-info.json \
    && npm run build \
    && node scripts/write-security-headers.mjs dist/index.html /app/security-headers.conf

# Stage 2 serves only the built files. Node and build tools do not ship in this image.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

USER 101:101
EXPOSE 8080
# Check that the local web page responds, not that a trainer or provider is connected.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
