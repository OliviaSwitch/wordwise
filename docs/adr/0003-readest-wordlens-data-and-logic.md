# Readest WordLens data and logic

WordWise uses Readest's WordLens `en-zh.json` Gloss Pack as its primary data source and adapts its word-matching logic (GlossIndex, planner, difficulty cutoffs, lemmatization, derivational reduction). The underlying data comes from ECDICT (MIT) and FrequencyWords (CC-BY-SA 4.0). Readest itself is AGPL v3, so WordWise adopts AGPL v3 as well.

We considered building our own data pipeline from COCA or EVP, but COCA has commercial licensing restrictions and EVP has copyright concerns. The Readest data is well-structured (rank + gloss + inflection table), already cleaned, and covers 24,446 English headwords — sufficient for the initial release.
