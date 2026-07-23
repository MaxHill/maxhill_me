# Runbook — Edit secrets & config

Rotate an API key, change a `to:` address, flip a config value, etc.
Applies to any `<app>.prod.enc.env` under `vps/`.

Pick your app. Examples:

- `vps/alert-on-failure.prod.enc.env` — decrypted during **bootstrap**.
- `vps/auth/auth.prod.enc.env` — decrypted during **deploy**.

The pattern is identical; only the "apply" step differs (§3).

## 1. Edit in place

```bash
sops edit vps/<app>.prod.enc.env
```

sops decrypts to a temp file, opens `$EDITOR`, re-encrypts on save.
Never writes plaintext to the repo. Don't `sops -d` to a sibling
file and edit that — you'll leak it.

## 2. Commit

```bash
git add vps/<app>.prod.enc.env
git diff --cached vps/<app>.prod.enc.env   # sanity: only ciphertext + MAC changed
git commit -m "<app>: rotate <thing>"
git push
```

## 3. Apply

Depends on when the file is decrypted on the box:

**Bootstrap-decrypted apps** (e.g. `alert-on-failure`) — files written
to `/etc/<app>/` by `bootstrap.sh`:

```bash
mise run bootstrap
```

Idempotent. Rewrites the plaintext env under `/etc/<app>/`. No restart
needed if the helper reads its config each time it fires; otherwise
restart the relevant unit.

**Deploy-decrypted apps** (e.g. `auth`) — files written during the
app's normal deploy:

```bash
mise run deploy:<app>
```

## 4. Verify

App-specific. Some examples:

- `alert-on-failure` — trigger a failure and confirm the email lands:
  ```bash
  ssh root@$VPS_HOST 'systemd-run --unit=alert-smoketest-$$ /bin/false'
  ```
  Unit exits non-zero → `OnFailure=` fires → email arrives.
- Any HTTP app — hit its health endpoint, then tail
  `journalctl -u <app>` on the box.

---

## Adding a new recipient later

Second laptop, replacement VPS, whatever. Get the new pubkey, then:

```bash
# 1. Append the pubkey to the `age:` list in .sops.yaml (comma-separated).
$EDITOR .sops.yaml

# 2. Re-wrap every encrypted file against the new recipient set.
find vps -name '*.enc.env' -exec sops updatekeys {} \;

# 3. Commit both.
git add .sops.yaml vps/**/*.enc.env
git commit -m "sops: add <who> as recipient"
```

`updatekeys` only re-wraps the data key — the encrypted payload
itself doesn't change, so diffs stay small.

---

## If it goes wrong

- **`sops edit` says "no key could decrypt the data"** — your laptop
  age key isn't in `.sops.yaml`'s recipients for this file, or
  `SOPS_AGE_KEY_FILE` / `~/.config/sops/age/keys.txt` doesn't point
  at it. Fix the env, don't re-encrypt.
- **Bootstrap or deploy fails on the decrypt step** — the VPS age key
  isn't a recipient. Run `sops updatekeys` (see above), commit, retry.
- **App misbehaves after apply** — check `journalctl -u <app>` on the
  box. Usually a typo in the new value (bad API key, unverified
  sending domain, etc.).
