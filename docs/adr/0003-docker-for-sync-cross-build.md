# Docker for cross-building `apps/syncdb-server` to Linux/amd64

`vps/sync/deploy.sh` builds the sync binary inside a Docker builder
image (`ocaml/opam:ubuntu-24.04-ocaml-5.2` + libssl/libsqlite/libgmp
apt deps) before rsync'ing the resulting Linux/amd64 ELF to the VPS.
The image is built lazily on first deploy and cached; opam state
persists in a named Docker volume so re-deploys are incremental. No
Docker on the VPS itself — the box still runs the plain ELF under
systemd.

## Shape

- `vps/sync/Dockerfile.builder` — pinned to OCaml 5.2 (matches
  `apps/syncdb-server/dune-project`), Ubuntu 24.04, apt deps for the native
  libs sync links against.
- `vps/sync/deploy.sh` step 1 — `docker build` if the image is
  missing, then `docker run --platform linux/amd64` with the repo
  bind-mounted and a named opam-cache volume
  (`maxhill-sync-opam-cache`). Inside the container: `opam install
  --deps-only` against the image's pre-installed OCaml 5.2 switch,
  then `dune build ./bin/main.exe --profile release`. The build
  target is scoped to `bin/main.exe` (not `.`) so `apps/syncdb-server/sim/`,
  which depends on `hegel`, is skipped in release builds. `_build/`
  stays in the bind-mounted repo — no separate volume — so step 2's
  `rsync` sees the produced ELF on the host directly. Steps 2 and 3
  (rsync + release on box) are unchanged from before.
- `apps/syncdb-server` dependency cleanup bundled with this switch:
  `hegel` and `ppx_hegel_test` moved to `{with-test}` in
  `dune-project` (regenerated `sync.opam`). They're only used by
  `apps/syncdb-server/sim/`; the release binary doesn't need them, so the
  Docker builder never has to fetch them from GitHub during deploy.

## Why not native cross-compile

Explored in a timeboxed spike (`opam-cross-generic` + zig + a Debian
sysroot on macOS-arm64 host, linux-x86_64 target). Result: 80% of the
way there, but a systemic blocker in dune. `-x cross` builds every
build-time OCaml helper as a Linux ELF and then tries to run it on
the macOS host — concretely `seq/select_version.exe`,
`yojson/configure_env.exe`, and zarith's custom configure fail with
`posix_spawn(): Exec format error`. Each affected upstream package
would need to declare its build helper as a host-side tool; the
patch surface grows with the dep tree (~6 packages just for sync
today, more behind them, regressing on any upgrade).

Docker sidesteps all of it: the host and target are both Linux inside
the container, so nothing about the OCaml ecosystem needs to change.
Revisit if dune ever ships automatic host-context routing for
`(run ./foo.exe)` rules, or if the deps land the build-helper-in-host
patches upstream.

## Why not build on the VPS

Would work, but drags an OCaml toolchain, libssl/libsqlite/libgmp dev
headers, and ~4GB of switch state onto a 4GB box that's otherwise
supposed to run services and nothing else. Also puts build failures
in the deploy path *after* rsync, which is the wrong place for them.

## Consequences

- **New dev prereq for deploying sync**: Docker. Everything else
  (auth via bun, site/golf via pnpm) still deploys with no
  container runtime. This asymmetry is documented in `docs/vps.md`.
- **First deploy from a fresh machine is slow** — ~5 min to build
  the image + install opam deps. Subsequent deploys reuse both the
  image and the `maxhill-sync-opam-cache` volume, so incremental
  builds are ~30s.
- **On Apple Silicon the build is emulated** (linux/amd64 via
  qemu). Acceptable for a laptop-driven deploy; if it becomes
  painful, run the same script on an amd64 runner without changing
  anything else. The VPS is x86_64 (confirmed by
  `vps/auth/deploy.sh` shipping `bun-linux-x64`).
- **`docs/vps.md`'s "no Docker" line now means "no Docker on the
  box"** — build-time containerisation for one app is a smaller
  compromise than shipping upstream OCaml patches or maintaining a
  fork of `seq`/`yojson`/`zarith`. ADR 0001 amended in kind.

## Considered options

- **Native cross-compile via zig + `opam-cross-generic`** — see
  above. Parked; the spike's repro path (opam repo pins + zig cc
  wrapper + sysroot from Debian .debs) is documented in the commit
  history of the POC branch. Revisit when dune fixes host-context
  routing.
- **Build on the VPS** — rejected on resource + failure-locality
  grounds (see above).

## Amendments

### Docker 29 / containerd image store + `USER opam` (2026-07)

On a machine running Docker 29+ with the containerd image store as
default (Docker Desktop, or fresh Ubuntu 26.04 installs), the
builder image failed to build with:

> unable to find user opam: no matching entries in passwd file

Root cause: the `ocaml/opam` base image sets `USER opam` by name.
The containerd image store regressed username → UID resolution at
`RUN` time, so `sudo` (and the shell itself) can't identify the
current user. Same class of bug as Docker 29's
`COPY --link --chown=<name>` failing with `invalid user index: -1`
(see [Tunbury, 2026-06-06](https://www.tunbury.org/2026/06/06/docker-29/)).

Fix in `Dockerfile.builder`: use numeric UIDs instead of names —
`USER 0` for the apt step, `USER 1000` after — and drop `sudo`.
Avoid `USER opam` / `USER root` by name in this file.
