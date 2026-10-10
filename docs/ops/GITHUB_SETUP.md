# Publish this planning repository to GitHub

**Why:** GitHub connector available in current assistant session supports editing existing repos but no `create repository` operation. This folder is prepared locally; publishing requires a repo created by its owner or an authenticated local GitHub CLI. **Do not claim it has been pushed until remote verification succeeds.**

## Preferred: GitHub CLI (local machine, logged into your own GitHub)

From the root of the unpacked planning folder:

```bash
gh auth status
gh repo create banh-mi-cho-pos --private --source=. --remote=origin --push
```

If you unpacked ZIP (which does not include `.git`), first initialize:

```bash
git init -b main
git add .
git -c user.name='Banh Mi Cho planning' -c user.email='planning@local.invalid' commit -m 'docs: baseline MVP v1.2, plans and agent workflow'
```

Never paste GitHub personal access tokens into files or ChatGPT.

## Browser fallback

1. Open https://github.com/new . Choose personal owner `vitoo16`, repository name `banh-mi-cho-pos`, visibility **Private**; keep README/.gitignore/license boxes **unchecked**.
2. From your extracted local folder: `git init -b main` and `git add .` / `git commit -m "docs: POS MVP v1.2 plans"` if no `.git` exists.
3. Run:

```bash
git remote add origin https://github.com/vitoo16/banh-mi-cho-pos.git
git push -u origin main
```

4. Verify on GitHub that `docs/spec/MVP-v1.2.md`, `docs/plans/MASTER_PLAN.md`, `AGENTS.md` and the skill files are visible in `main` and Actions docs check succeeded.

## Git bundle path (preserves existing commit history)

The supplied `.git.bundle` can be cloned:

```bash
git clone banh-mi-cho-pos.git.bundle banh-mi-cho-pos
cd banh-mi-cho-pos
git remote remove origin # bundle-origin removed
# after creating an empty private GitHub repo:
git remote add origin https://github.com/vitoo16/banh-mi-cho-pos.git
git push -u origin main
```

## After publication
- Set branch protection for `main`: require PR review, CI check, avoid force pushes, secret scanning/dependabot as available.
- Create GitHub Issues from `MASTER_PLAN.md` M0->M1->M2..., with blocked labels (if any). Don't mark tasks done from docs-only CI.
- If the assistant gets an existing remote repo connection, it can add issues/PRs/files via GitHub connector then verify the actual URLs.
