# Runbook — Edit secrets and config

Rotate an API key. Change a `to:` address. Change a config value. This
applies to any `<app>.prod.enc.env` file under `vps/`.

Pick your app. Examples:

- `vps/alert-on-failure/alert-on-failure.prod.enc.env` — decrypted during
  **deploy**.
- `vps/auth/auth.prod.enc.env` — decrypted during **deploy**.

The pattern is the same for every `.prod.enc.env` file.

## 1. Edit in place

```bash
sops edit vps/<app>.prod.enc.env
```

sops decrypts to a temp file. sops opens `$EDITOR`. sops re-encrypts the
file on save. sops never writes plaintext to the repo. Do not run `sops -d`
to a sibling file and edit that. You will leak the plaintext.

## 2. Commit

```bash
git add vps/<app>.prod.enc.env
git diff --cached vps/<app>.prod.enc.env   # sanity: only ciphertext and MAC changed
git commit -m "<app>: rotate <thing>"
git push
```

## 3. Apply

Redeploy the app so `deploy.sh` re-decrypts the env on the box:

```bash
mise run deploy:<app>
```

## 4. Verify

The check is app-specific. Examples:

- `alert-on-failure` — trigger a failure. Confirm the email lands:
  ```bash
  ssh root@$VPS_HOST 'systemd-run --unit=alert-smoketest-$$ /bin/false'
  ```
  The unit exits non-zero. `OnFailure=` fires. Email arrives.
- Any HTTP app — hit its health endpoint. Then tail `journalctl -u <app>`
  on the box.

---

## Add a new recipient later

Use this for a second laptop or a replacement VPS. Get the new pubkey,
then:

```bash
# 1. Append the pubkey to the `age:` list in .sops.yaml (comma-separated).
$EDITOR .sops.yaml

# 2. Re-wrap every encrypted file against the new recipient set.
find vps -name '*.enc.env' -exec sops updatekeys {} \;

# 3. Commit both.
git add .sops.yaml vps/**/*.enc.env
git commit -m "sops: add <who> as recipient"
```

`updatekeys` re-wraps only the data key. The encrypted payload does not
change. Diffs stay small.

---

## If it goes wrong

- **`sops edit` says "no key could decrypt the data"** — the laptop age key
  is not in the `.sops.yaml` recipients for this file. Or
  `SOPS_AGE_KEY_FILE` or `~/.config/sops/age/keys.txt` does not point at
  it. Fix the env. Do not re-encrypt.
- **Bootstrap or deploy fails on the decrypt step** — the VPS age key is
  not a recipient. Run `sops updatekeys` (see above). Commit. Retry.
- **App misbehaves after apply** — check `journalctl -u <app>` on the box.
  The cause is usually a typo in the new value (a bad API key, an
  unverified sending domain, and so on).
