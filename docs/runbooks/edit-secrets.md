# Runbook — Edit secrets and config

Use this runbook to change a production secret or config value.
This runbook applies to `vps/<app>/<app>.prod.enc.env` files.

Examples:

- `vps/alert-on-failure/alert-on-failure.prod.enc.env`
- `vps/auth/auth.prod.enc.env`

## 1. Edit the encrypted file

```bash
sops edit vps/<app>/<app>.prod.enc.env
```

SOPS decrypts to a temporary file.
SOPS opens `$EDITOR`.
SOPS encrypts again when you save.
Do not write plaintext to a repo file.
Do not run `sops -d` to a sibling file.

## 2. Commit the change

```bash
git add vps/<app>/<app>.prod.enc.env
git diff --cached vps/<app>/<app>.prod.enc.env
git commit -m "<app>: rotate <thing>"
git push
```

Make sure only ciphertext and MAC changed.

## 3. Apply the change on the VPS

```bash
mise run deploy:<app>
```

`deploy.ts` decrypts the env file on the box.

## 4. Verify

Use an app-specific check.

Example for `alert-on-failure`:

```bash
ssh ubuntu@$VPS_HOST 'sudo systemd-run --unit=alert-smoketest-$$ /bin/false'
```

Make sure an email arrives.

Example for HTTP apps:

1. Call the app health endpoint.
2. Check logs with `journalctl -u <app>`.

---

## Add a new recipient

Use this when you add a laptop key or a new VPS key.

```bash
$EDITOR .sops.yaml
find vps -name '*.enc.env' -exec sops updatekeys {} \;
git add .sops.yaml vps/**/*.enc.env
git commit -m "sops: add <who> as recipient"
```

`updatekeys` re-wraps only the data key.
The encrypted payload stays the same.

---

## If it goes wrong

- **`sops edit` says no key can decrypt**
  Check `.sops.yaml` recipients.
  Check `SOPS_AGE_KEY_FILE` or `~/.config/sops/age/keys.txt`.
- **Deploy fails on decrypt**
  Add the VPS key to recipients.
  Run `sops updatekeys`.
  Commit and deploy again.
- **App fails after deploy**
  Check `journalctl -u <app>`.
  Check for wrong values, such as API keys.
