# Polygun Arena — Release History Table

> Kaynak: Slack `#pa-releasehistory`.
> Bu tablo bir Claude Routine tarafından düzenli aralıklarla güncellenir.
> **Son güncelleme:** 1 Temmuz 2026 16:00

**Kısaltmalar:** CT = closed testing · OT = open testing · Prod = production.

**Durum değerleri:**
- 🧪 **Prod'a hiç açılmadı** — sadece closed testing / release process yok.
- 🟡 **Yayına hazırlanıyor** — review'da, Prod'a henüz açılmadı.
- 🟢 **Yayın** — şu an yayında. Parantez içinde `son force` ya da güncel rollout durumu (ör. `Android %100, iOS %100` / `Android %50, iOS roll out`).
- ⚫ **Artık yayında değil** — sonraki bir sürüm forcelandığı için. Eski durumu + hangi sürümün forcelandığı yazılır.
- 👊🏻 **Force işareti** — bir sürüm forcelandıysa (Force tarihi dolu) Durum emojisinin yanına eklenir.

| Sürüm | Slack thread | Build (iOS/Android) | Son gelişme (iOS) | Son gelişme (Android) | %100 açıldı | Force tarihi | Durum |
|-------|------|------|------|------|------|------|------|
| **v1.3507** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1782901893478599) | 545 / 855 | • 1 Tem 2026 13:36 — iOS review'a atıldı, expedited review istendi | • 1 Tem 2026 15:34 — CT %100, OT %100, Prod %1 için review'a atıldı | — | — | 🟡 Yayına hazırlanıyor (Android %1 review'a atıldı, iOS review'da) |
| **v1.3506** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1782801962649789) | 542 / 851 | • 1 Tem 2026 11:57 — Prod %100 açıldı | • 1 Tem 2026 11:57 — Prod %100 | 1 Tem 2026 11:57 (iOS & Android) | — | 🟢 Yayın (Android %100, iOS %100) |
| **v1.3504** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1782758762639939) | 541 / 850 | • 29 Haz 2026 22:05 — review atıldı, expedited istendi | • 30 Haz 2026 12:39 — Prod %5 yayınlandı | — | — | 🟢 Yayın (Android %5, iOS review'da) |
| **v1.3503** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1782745682707719) | 540 / 849 | — | — | — | — | 🧪 Release process yok |
| **v1.3008** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1782225723900559) | 529 / 834 | • 25 Haz 2026 16:35 — iOS forcelandı | • 25 Haz 2026 16:35 — Android forcelandı | 24 Haz 2026 16:25 (iOS & Android) | 25 Haz 2026 16:35 (iOS & Android) | 🟢👊🏻 Yayın (son force) |
| **v1.3007** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1781807714475289) | 525 / 826 | • 18 Haz 2026 22:18 — review atıldı, expedited istendi | • 19 Haz 2026 14:58 — Prod %10 açıldı | — | — | ⚫️ Android %10 açılmıştı, iOS review istenmişti, sonra v1.3008 forcelandı |
| **v1.3005** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1781724579489669) | 518 / 819 | • 17 Haz 2026 22:45 — review atıldı, expedited istendi | • 18 Haz 2026 10:38 — CT %100, OT %100, Prod %0 için review atıldı | — | — | 🧪 Sadece closed testing |
| **v1.2106** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1781622691335149) | 508 / 807 | • 17 Haz 2026 12:36 — Prod %100 yayınlandı | • 17 Haz 2026 12:36 — Prod %100 | 17 Haz 2026 12:36 (iOS & Android) | — | ⚫️ Android %100, iOS %100 açılmıştı, sonra v1.3008 forcelandı |
| **v1.2102** | [Link](https://vertigohq.slack.com/archives/C0AT9U4UYF2/p1778665497303429) | 456 / 722 | • 14 May 2026 16:32 — iOS forcelandı | • 14 May 2026 16:32 — Android forcelandı | 13 May 2026 23:20 (iOS & Android) | 14 May 2026 16:32 (iOS & Android) | ⚫️👊🏻 Forcelanmıştı, sonra v1.3008 forcelandı |
