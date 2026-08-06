# Runbook — Bootstrap the sync opam switch

One-time setup for `apps/syncdb-serverdb-server`. Creates a project-local opam switch and
pins the internal `hegel` toolchain. Run this after you clone the repo and
before the first `mise run run`. Run it again if the switch is deleted.

## Prereqs

- `opam` on PATH (mise installs it via `tools.opam` at repo root).
- Network access (pulls `hegel-ocaml` from GitHub).

## Steps

From `apps/syncdb-serverdb-server/`:

```sh
# 1. Create the local switch if it does not exist.
opam switch show --switch=. >/dev/null 2>&1 \
  || opam switch create . ocaml-base-compiler.5.2.0 --yes

# 2. Pin hegel from source.
opam pin add --switch=. hegel git+https://github.com/hegeldev/hegel-ocaml.git#main -y

# 3. Build and pin the hegel ppx plugins from the pulled source.
HEGEL_SRC="$(pwd)/_opam/.opam-switch/sources/hegel"
opam exec --switch=. -- dune build --root "$HEGEL_SRC" \
  ppx_hegel_compat.opam ppx_hegel_test.opam
opam pin add --switch=. ppx_hegel_compat "$HEGEL_SRC" -y
opam pin add --switch=. ppx_hegel_test "$HEGEL_SRC" -y

# 4. Install project deps and dev tooling.
opam install --switch=. . --deps-only -y
opam install --switch=. ocaml-lsp-server ocamlformat merlin -y
```

## Verify

```sh
mise run run     # boots the sync service against sync.dev.env
mise run test    # dune runtest
```

## Delete and retry

```sh
rm -rf _opam _build
# then run the steps above again
```
