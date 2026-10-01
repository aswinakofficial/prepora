# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/aswinakofficial/prepora/security/advisories/new>).

Include what you found, how to reproduce it, and its impact. We'll acknowledge the report within a
few days, keep you updated, and credit you in the fix unless you'd rather stay anonymous.

## Scope

In scope: the code in this repository and the site at <https://prepora.xpar.in>. Of particular
interest: authentication and admin authorisation, the scraper and pipeline services (they fetch
remote URLs and hold a service token), and anything that could expose user data or secrets.

Please don't run automated scans or load tests against the live site, and don't access other
people's data.
