# Build image for cross-compiling apps/sync from a dev machine
# (typically macOS/arm64) to Linux/amd64. Pinned to the same OCaml
# version as apps/sync (5.2). See docs/adr/0003-docker-for-sync-cross-build.md.
FROM ocaml/opam:ubuntu-24.04-ocaml-5.2
RUN sudo apt-get update && sudo apt-get install -y --no-install-recommends \
      libssl-dev pkg-config libgmp-dev libffi-dev libsqlite3-dev \
      m4 zlib1g-dev \
    && sudo rm -rf /var/lib/apt/lists/*
USER opam
