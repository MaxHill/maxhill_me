# Runbook — Edit alert-on-failure secrets

Rotate the Resend API key, change the `to:` address, etc. Same
pattern applies to any `<app>.prod.enc.json`.

## 1. Edit in place

```bash
sops edit vps/alert-on-failure.prod.enc.json
```

sops decrypts to a temp file, opens `$EDITOR`, re-encrypts on save.
Never writes plaintext to the repo. Don't `sops -d` to a sibling
file and edit that — you'll leak it.

## 2. Commit

```bash
git add vps/alert-on-failure.prod.enc.json
git diff --cached vps/alert-on-failure.prod.enc.json   # sanity: only ciphertext + MAC changed
git commit -m "alert-on-failure: rotate <thing>"
git push
```

## 3. Re-bootstrap

`alert-on-failure` is decrypted during `bootstrap.sh`, not during any
deploy:

```bash
mise run bootstrap
```

Idempotent. Rewrites `/etc/alert-on-failure/alert-on-failure.prod.json`
with the new plaintext. No restart needed — the helper reads its
config each time it fires.

## 4. Verify

Trigger a failure on any throwaway unit and confirm the email lands:

```bash
ssh root@$VPS_HOST 'systemd-run --unit=alert-smoketest-$$ /bin/false'
```

The unit exits non-zero → `OnFailure=` fires → email arrives at the
`to:` address.

---

## Adding a new recipient later

Second laptop, replacement VPS, whatever. Get the new pubkey, then:

```bash
# 1. Append the pubkey to the `age:` list in .sops.yaml (comma-separated).
$EDITOR .sops.yaml

# 2. Re-wrap every encrypted file against the new recipient set.
sops updatekeys vps/alert-on-failure.prod.enc.json
# (repeat for each *.enc.json)

# 3. Commit both.
git add .sops.yaml vps/*.enc.json
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
- **Bootstrap fails on the decrypt step** — the VPS age key isn't a
  recipient. Run `sops updatekeys` (see above), commit, re-bootstrap.
- **No email arrives** — check
  `journalctl -u alert-on-failure@<unit>` on the box. Usually a bad
  Resend API key or an unverified sending domain.
