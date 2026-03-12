# Security Policy

## Supported Versions

Only the latest commit on `main` is actively supported. There are no versioned releases at this time.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, email the maintainers directly. You can find contact information in the repository's GitHub profile. Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept (if safe to share).
- Any suggested mitigations you have in mind.

We aim to acknowledge reports within **72 hours** and will work with you to understand and address the issue before any public disclosure.

## Scope

ResearchOS is designed as a **single-user, locally-hosted application**. It is not intended to be exposed to the public internet or run in a multi-tenant environment. The threat model reflects this:

- The backend trusts the local network and does not implement authentication or authorization.
- API keys (`OPENAI_API_KEY`, `SUPABASE_KEY`) are stored in `backend/.env` — never commit this file.
- PDF and note content is stored in your own Supabase project — you control the data.

## Out of Scope

The following are **not** considered security vulnerabilities in the context of this project:

- Lack of authentication (by design — single-user local app).
- Rate limiting or abuse prevention (no public exposure intended).
- Self-XSS or issues that require physical access to your machine.

## Disclosure Policy

Once a fix is ready we will publish a summary of the vulnerability and the fix in the relevant commit message or a GitHub Security Advisory.
