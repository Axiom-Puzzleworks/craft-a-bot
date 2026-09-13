# Veterinary Practice — scaffolded by `craftabot scaffold domain`

A domain pack's shape (`docs/design-day2/93-DOMAIN-PACK.md`; `docs/blueprints/DOMAIN-PACK.md`): one world pack (`vet-practice/`) and one journey pack per journey (`vaccination/`, `referral/`).

It passes `checkDomainPack` with the placeholder content it was written with, and fails `checkCalibration({ requireReview: true })` — every row of its calibration table is a stated assumption awaiting a reader. The first thing to do is cite a row.

Made with:

```
craftabot scaffold domain --id veterinary-practice --sector "Veterinary services" --jurisdiction "UK" --world vet-practice --journey vaccination --journey referral --root Patient --relative --today 2026-09-12
```
