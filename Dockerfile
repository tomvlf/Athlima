# Stage 1 uses Node to turn editable source into browser-ready files.
# The digest fixes the exact base image; it must be updated deliberately for patches.
FROM docker.io/library/node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build

WORKDIR /app

COPY package.json package-lock.json ./
# Install the exact dependency versions recorded in the lockfile. Install
# scripts are skipped: the build tooling ships prebuilt native binaries through
# optional dependencies, and a compromised package should not run code during
# the image build. Verify `npm run build` after changing dependencies.
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
ARG TOO_MANY_WATTS_BUILD_VERSION=development
ARG TOO_MANY_WATTS_BUILD_REVISION=
# Require passing tests before embedding the release label and building the app.
# Security-header hashes must be regenerated whenever the built HTML changes.
RUN npm test -- --runInBand \
    && node scripts/write-build-info.mjs src/platform/build-info.json \
    && npm run build \
    && node scripts/write-security-headers.mjs dist/index.html /app/security-headers.conf

# Stage 2 serves only the built files. Use the maintained NGINX unprivileged registry; the former
# nginxinc registry is archived. Pin the patched stable release and let the vulnerability gate verify
# its complete runtime package set before publication.
FROM docker.io/nginx/nginx-unprivileged:1.31.10-alpine3.24@sha256:86628f2c9eaa5e84e3b98d25e26563c4a4f9b0ead9cf5656da4731d86e0621de

USER root
RUN apk upgrade --no-cache libxml2

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
