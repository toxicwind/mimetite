# NGC Activation Surface — Mass-Probe Recon (2026-11-10)

**Method:** every claim live-probed this run; untreated sources downgraded.
**Artifacts:** appended below, deep-linked (sha256-anchored), never duplicated inline.
**Related:** docs/anomalies-2026-11-10.md (NIM × Vercel) · research/nvcf-vs-integrate.md (function-plane)

## What this is
A third orthogonal recon: the *activation/entitlement plane*, distinct from the
NIM/model plane (anomalies doc) and the NVCF/immediate function plane (research doc).
Probes: unauthenticated public surface. No serial/token/promo ever POSTed — the page's
own gate is server-side.

## Artifact index
| Artifact | Path | Contents |
|---|---|---|
| Mass probe matrix (30 probes) | `~/pens/hermes/cache/scratch/ngc_poc/mass_poc_results.json` | method/url/status/len/sha256/body-head |
| OpenAPI schema | `~/pens/hermes/cache/scratch/ngc_poc/openapi_schema.json` | `api.ngc.nvidia.com/v3/api-docs` → 200 no-auth, OpenAPI 3.0.1 v3.249.17, 77 paths |
| Roles catalog | `~/pens/hermes/cache/scratch/ngc_poc/roles_dump.json` | `/roles?show-hidden=true` → 200 no-auth, 370 roles |
| Full report | `~/pens/hermes/cache/scratch/ngc_poc/ANOMALY_REPORT_IV.md` | writeup + confidence |

## Public-surface asymmetry (OBSERVED)
`/org.ngc.nvidia.com/activate`, `/api.ngc.nvidia.com/roles`, `/v3/api-docs`, and
`catalog.ngc.nvidia.com/_.data` all answer **200 with zero auth**. Everything adjacent
(`/subscriptions`, `/account/api-keys`, `/setup/api-keys`, `/usage`, `/v2/ping`,
`/v3/product-activations`, `/v2/users/me/subscriptions`, `/nvcr.io/v2/`,
`/authn.nvidia.com/token`) answers **401**. The activation page renders before login;
its submission is gated server-side.

## The schema contradicts the UI (SCHEMA-VERIFIED)
OpenAPI v3.249.17 (77 paths) has **no subscription/serial/promo activation endpoint**.
Full-body grep of the 294 KB schema: `serial`=0, `promo`=0, `activate`=1 (user
activationToken field), `activation`=2 (same). The only entitlement reads are
admin-only and declare HTTP 402:
- `GET /v2/admin/entitlements`
- `GET /v2/admin/org/{org-name}/entitlements`

**Anomaly:** the read path is admin-only/payment-aware (402), yet the only write path
that turns a serial into an entitlement is a server-rendered RSC form with **no API**.
No programmatic activation exists — the browser is mandatory.

## Roles catalog — subscription is an approval workflow (OBSERVED)
370 roles fetched no-auth. Notables:
- `ORG_OWNER` → ORG[ADMIN_READ, ADMIN, READ, WRITE, OWNER] + `iam:createApiKey` (`allowedActionsUam`)
- Three `*_SUBSCRIPTION_REQUEST_APPROVER` roles: `DGXC_RUNAI_SUBSCRIPTION_REQUEST_APPROVER`,
  `OMNIVERSE_SUBSCRIPTION_REQUEST_APPROVER`, `DGX_CLOUD_SUBSCRIPTION_REQUEST_APPROVER`
- NVIDIA AI Enterprise: `NVIDIA_AI_ENTERPRISE_ENABLER` (ORG[OWNER]+NVAIE[READ]),
  `NVIDIA_AI_ENTERPRISE_VIEWER` (NVAIE[READ])

**Zero** roles govern "promo" / "promotional code". The `"Promotional Code, Serial
Number, or Token"` field maps to no role in the access model.

**Anomaly:** the subscription request path is an **approval workflow**, not a code check
— human approver roles sit between submission and entitlement.

## Synthesis
`org.ngc.nvidia.com/activate` (200 no-auth render; gated submission)
→ field grammar PAK | hardware serial | CSP VM token | OIDC access token
→ NO HTTP API backs it (RSC form action only; audit shows `POST "$undefined"` ghost)
→ entitlement written behind `*_SUBSCRIPTION_REQUEST_APPROVER` roles
→ read via admin-only `GET /v2/admin/entitlements` (HTTP 402 ladder)
→ enforced at pull time by `nvcr.io` registry token (401 unauthed).

## Open question (sole unexecuted step)
Submit a serial through the RSC action under an **authenticated org-owner** session to
observe the "on hold" state machine and definitively label the promo field generic vs
vendored. Not done — the gate is server-side and we POST no fake entitlement.