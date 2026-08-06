# Build image for cross-compiling apps/syncdb-server from a dev machine
# (typically macOS/arm64) to Linux/amd64. Pinned to the same OCaml
# version as apps/syncdb-server (5.2). See docs/adr/0003-docker-for-sync-cross-build.md.
FROM ocaml/opam:ubuntu-24.04-ocaml-5.2
# Base image sets `USER opam`, but Docker 29's containerd image store
# sometimes fails to resolve that username at RUN time
# ("unable to find user opam: no matching entries in passwd file").
# Switch to root by numeric UID for the apt step, then back to opam (uid 1000).
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl-dev pkg-config libgmp-dev libffi-dev libsqlite3-dev \
      m4 zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
USER 1000
