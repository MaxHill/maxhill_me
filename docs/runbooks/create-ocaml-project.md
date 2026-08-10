# Runbook — Create an OCaml project

Use the Plop generator to create an OCaml project with these features:

- a local opam switch
- a `mise` task interface
- inline `ppx_expect` tests in `lib/`
- Hegel property tests in `test/`

## Prerequisites

- `mise` is on `PATH`.
- Run commands from the repository root unless a step says otherwise.

## 1. Generate the project

Run the Plop generator:

```sh
mise run generate
```

Select `ocaml-project`. Enter the OCaml project name.

Enter the project path relative to `<repo_root>`. For example, enter
`apps/my_app` to create `<repo_root>/apps/my_app`.

The generator creates the project files. It does not create the local opam
switch.

## 2. Enter the project

```sh
cd <project-path>
```

## 3. Install opam

```sh
mise install
```

Initialize opam if this machine does not have an opam root:

```sh
# This adds opam environment loading to your shell configuration.
opam init --shell-setup -y
```

Opam adds a `source` line to your shell configuration. This line is
expected. The later direct `dune` commands need this setup.

Start a new shell after this command. You can also activate opam in the
current shell:

```sh
eval "$(opam env)"
```

## 4. Create the local switch

```sh
opam switch create . ocaml-base-compiler.5.2.0 --yes
```

Activate the new local switch in the current shell:

```sh
eval "$(opam env --switch=. --set-switch)"
```

Install dune in the local switch:

```sh
opam install dune -y
```

## 5. Pin Hegel

Hegel is not always available from the configured opam repositories. Pin
Hegel and its matching PPX packages from one Git revision.

```sh
opam pin add hegel git+https://github.com/hegeldev/hegel-ocaml.git#main -y && \
HEGEL_SRC="$(pwd)/_opam/.opam-switch/sources/hegel" && \
dune build --root "$HEGEL_SRC" \
  ppx_hegel_compat.opam ppx_hegel_test.opam && \
opam pin add ppx_hegel_compat "$HEGEL_SRC" -y && \
opam pin add ppx_hegel_test "$HEGEL_SRC" -y
```

## 6. Install project dependencies

```sh
opam install . --deps-only --with-test -y
```

This installs `ppx_expect`, Hegel, and the other dependencies from
`<project-name>.opam`.

## 7. Verify the project

Run the generated application:

```sh
mise run run
```

Expected output:

```text
Hello, World!
```

Run the expect test and the Hegel property test:

```sh
mise run test
```

## Optional — Add Cmdliner

Complete all previous steps before you add Cmdliner. This example shows how
to add and use a normal opam package.

`apps/syncdb-server/dune-project`, `apps/syncdb-server/bin/dune`, and
`apps/syncdb-server/bin/simulator.ml` provide a larger reference.

### 1. Declare the dependency

Add `cmdliner` to the package dependencies in `dune-project`:

```lisp
(depends
  ocaml
  ppx_expect
  cmdliner
  (hegel :with-test)
  (ppx_hegel_test :with-test))
```

### 2. Regenerate the opam file

```sh
dune runtest --auto-promote || dune runtest
```

The first command promotes the changed `<project-name>.opam` file. Dune
runs the tests again if the promotion returns a nonzero status.

### 3. Install the dependency

```sh
opam install . --deps-only --with-test -y
```

Opam reads the generated `<project-name>.opam` file and installs Cmdliner.

### 4. Link Cmdliner to the executable

Add `cmdliner` to `bin/dune`:

```lisp
(executable
 (public_name <project-name>)
 (name main)
 (libraries <project-name> cmdliner))
```

### 5. Add a command-line option

Replace `bin/main.ml` with this example:

```ocaml
open Cmdliner


let run name = print_endline (<Project_module>.greet name)

let command =
  let name =
    let doc = "Name to greet." in
    Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
  ;;
  let info = Cmd.info "<project-name>" ~doc:"Print a greeting." in
  Cmd.v info Term.(const run $ name)
;;

let () = exit (Cmd.eval command)
```

Replace `<Project_module>` with the OCaml module name. For example, use
`My_app` for the project name `my_app`.

### 6. Verify Cmdliner

```sh
dune exec ./bin/main.exe -- --name Max
```

Expected output:

```text
Hello, Max!
```

Check the generated help:

```sh
dune exec ./bin/main.exe -- --help
```
