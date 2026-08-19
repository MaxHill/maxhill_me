# syncdb-server

Install and run the OCaml sync service.

## Prerequisites

- Run from `apps/syncdb-server`.
- `opam` is available on `PATH`.
- Network access (for `hegel-ocaml` pins).

If this machine has never used opam, initialize it once:

```sh
opam init --shell-setup -y
# then open a new shell, or run:
eval "$(opam env)"
```

## Install

```sh
# 1) Create project-local switch (first time only).
opam switch show --switch=. >/dev/null 2>&1 \
  || opam switch create . ocaml-base-compiler.5.2.0 --yes

# 2) Install dune first (needed to build pinned hegel ppx opam files).
opam install --switch=. dune -y

# 3) Pin hegel and matching ppx packages from one source revision.
opam pin add --switch=. hegel git+https://github.com/hegeldev/hegel-ocaml.git#main -y
HEGEL_SRC="$(pwd)/_opam/.opam-switch/sources/hegel"
opam exec --switch=. -- dune build --root "$HEGEL_SRC" \
  ppx_hegel_compat.opam ppx_hegel_test.opam
opam pin add --switch=. ppx_hegel_compat "$HEGEL_SRC" -y
opam pin add --switch=. ppx_hegel_test "$HEGEL_SRC" -y

# 4) Install project deps + dev tools in one command.
opam install --switch=. . --deps-only ocaml-lsp-server ocamlformat merlin -y
```

## Run

```sh
mise run run
```

## Test

```sh
mise run test
```

## Fuzz (unbounded simulator)

```sh
mise run fuzz
```

## Reset local build/switch

```sh
rm -rf _opam _build
```
Then run the install steps again.
