# Runbook — Bootstrap the sync opam switch

One-time setup for `apps/sync` — creates a project-local opam switch
and pins the internal `hegel` toolchain. Run this after cloning
before the first `mise run run`, or when the switch gets nuked.

## Prereqs

- `opam` on PATH (mise installs it via `tools.opam` at repo root).
- Network access (pulls `hegel-ocaml` from GitHub).

## Steps

From `apps/sync/`:

```sh
# 1. Create the local switch if it doesn't exist.
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

# 4. Install project deps + dev tooling.
opam install --switch=. . --deps-only -y
opam install --switch=. ocaml-lsp-server ocamlformat merlin -y
```

## Verify

```sh
mise run run     # boots the sync service against sync.dev.env
mise run test    # dune runtest
```

## Nuke and retry

```sh
rm -rf _opam _build
# then run the steps above again
```
