# WordWise — Gloss Pack Data

The gloss pack (`en-zh.json`, ~1.8 MB) is committed to this repository and served
alongside the app on GitHub Pages, so the deployed site has data out of the box.

## Update

To refresh the pack from upstream, download the file over the committed copy:

```bash
curl -L -o data/en-zh.json \
  "https://github.com/readest/readest/raw/main/apps/readest-app/data/wordlens/en-zh.json"
```

## Source

[Readest WordLens](https://github.com/readest/readest/tree/main/apps/readest-app/data/wordlens) — licensed under AGPL v3.
The underlying data comes from ECDICT (MIT) and FrequencyWords (CC-BY-SA 4.0).
