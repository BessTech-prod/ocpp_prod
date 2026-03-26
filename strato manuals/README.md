# Backup SSH secrets

Place backup SSH material here for `backup-service`.

Expected files:

- `backup_git_ed25519` — private deploy key with write access to `BessTech-prod/ocpp_backups`
- `github_known_hosts` — output from `ssh-keyscan github.com`

Example:

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
mkdir -p secrets
chmod 700 secrets
ssh-keyscan github.com > secrets/github_known_hosts
chmod 644 secrets/github_known_hosts
# copy your private key to secrets/backup_git_ed25519
chmod 600 secrets/backup_git_ed25519
```

The `backup-service` mounts this directory read-only at `/run/secrets`.

