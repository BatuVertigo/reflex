# Routine Prompt - Skill Catalog Güncelle

Vertigo'nun skill kataloğunu tek kaynaktan senkron tut: VertigoAI reposundaki `docs/SKILL_CATALOG.md` ve ekibin Slack canvası. Değişiklik yoksa hiçbir şeye dokunmadan çık.

## Sabitler

- **Repo:** `/Users/vertigo/Desktop/Code/GitHub/VertigoAI` (branch: `main`)
- **Katalog dosyası:** `docs/SKILL_CATALOG.md`
- **Manifest:** `plugin-list.json` (marketplace + plugin listesi; tek doğruluk kaynağı)
- **Vertigo skill kaynakları:** `plugins/vertigo-core-skills/skills/*/SKILL.md`, `plugins/vertigo-extra-skills/skills/*/SKILL.md` (ileride `plugins/vertigo-*-skills` deseninde yenileri gelebilir — hepsini tara)
- **Harici pluginler:** kataloglanacak plugin listesi DOĞRUDAN `plugin-list.json`'ın `plugins` alanından gelir (vertigo marketplace'inden olmayanlar). Her birinin skill adı/açıklaması için kurulu kopyasına bak: `installPath` = `~/.claude/plugins/installed_plugins.json`; önce `.claude-plugin/plugin.json` içindeki `skills` alanı, yoksa `skills/` + `commands/` klasörleri (caveman'in `caveman-init`'i bir command'dir ve kataloğa dahildir). Manifest'te olup makinede kurulu olmayan plugin varsa önce `claude plugin install <plugin> --scope user` ile kur, sonra katalogla.
- **Slack canvas:** ID `F0BK9DRSMA9` (https://vertigohq.slack.com/docs/T1A4URVT2/F0BK9DRSMA9)
- **State dosyası:** bu prompt'un yanındaki `skill_catalog_state.json` — son senkronun izi

## 0. Değişiklik algılama (önce bu; değişiklik yoksa çık)

1. Repoda `git checkout main && git pull`. Yerel değişiklik SADECE `docs/SKILL_CATALOG.md`'deyse normaldir (önceki koşunun henüz commit'lenmemiş çıktısı) — devam et; başka dosyada yerel değişiklik varsa veya pull çakışırsa stash'leme, dokunma — raporla ve çık.
2. Şu imzayı hesapla:
   - `git log -1 --format=%H -- plugin-list.json plugins/` (Vertigo tarafı)
   - `plugin-list.json`'daki her harici plugin'in `installed_plugins.json`'daki `version` değeri (harici taraf; kurulu değilse "missing" say — bu da değişikliktir)
3. İmza `skill_catalog_state.json` ile aynıysa: **hiçbir şey yapma**, "değişiklik yok" diye tek satır raporla, çık.

## Görev 1 — docs/SKILL_CATALOG.md güncelle

1. Tüm skill setlerini oku: her skill için ad + `SKILL.md` frontmatter'daki `description`.
2. `docs/SKILL_CATALOG.md`'deki tablolarla karşılaştır; SADECE farkları işle:
   - Yeni skill → ilgili tabloya satır ekle. Silinen skill → satırı kaldır. Description özü değişmiş → satırı güncelle.
   - `plugin-list.json`'a yeni plugin eklenmişse → aynı formatta yeni `## <Plugin adı>` bölümü + tablo ekle (mevcut sıra korunur: Vertigo core, Vertigo extra, sonra harici pluginler).
3. **Açıklama stili:** Türkçe, kısa ama anlaşılır — 1-2 cümle, "ne yapar + ne zaman kullanılır" kalıbı. İngilizce description'ı çevirip sıkıştır; teknik terimler ve komut adları aynen kalır.
4. **Dokunma kuralları:** Tablo dışındaki el yazısı metinleri (giriş cümleleri, notlar) ASLA yeniden yazma; başlık adlarını değiştirme; sadece skill satırları eklenir/silinir/güncellenir.
5. Dosyayı kaydet, bu kadar — **commit veya push YAPMA**. Raporda "SKILL_CATALOG.md güncellendi, commit bekliyor" diye belirt.

## Görev 2 — Slack canvasını aynala

1. `slack_read_canvas` ile canvası TAZE oku — section ID'ler her update'te değişir, asla eski ID kullanma.
2. Canvasta senin alanın SADECE `# Skill Catalog` H1'inden sonrası. Ondan önceki her şeye (`# 🎯 Skills` başlığı, `# Kullanım örnekleri` bölümü ve içeriği — adları değişmiş olsa bile Skill Catalog öncesindeki tüm bölümler) **kesinlikle dokunma**.
3. `docs/SKILL_CATALOG.md`'nin son halini `# Skill Catalog` altına eşitle:
   - Dosyanın kendi `# Skill Catalog` H1 satırını canvasa YAZMA (başlık canvasta zaten var; ikilenmesin).
   - Değişen tabloları/bölümleri `slack_update_canvas` ile section-`replace` et; yeni bölüm gerekiyorsa son bölümün altına `append` et; kalkan bölümü `delete` et. Tüm operasyonları tek atomik `sections` çağrısında topla.
   - Canvas markdown notları: tablolar destekli; hücre içinde `|` karakteri `\|` olarak kaçırılmalı; sadece `#`/`##`/`###` başlık seviyeleri.
4. Update sonrası dönen mapping'den, Skill Catalog öncesi bölümlerin aynen durduğunu doğrula.

## Kapanış

1. `skill_catalog_state.json`'a yeni imzayı yaz.
2. Kısa rapor: ne değişti (plugin/skill adları), hangi tablolar güncellendi, canvas URL. Değişiklik yoksa "no-op".

## Guardrail'ler

- İdempotent ol: üst üste koşmak zarar vermemeli; emin olmadığın durumda değişiklik yapmadan raporla.
- Canvas'ta veya SKILL_CATALOG.md'de beklenmeyen yapı görürsen (Skill Catalog H1'i yok, tablolar elle bozulmuş vb.) tahminle düzeltmeye çalışma — durumu raporla ve çık.
- Repo'da `docs/SKILL_CATALOG.md` dışında hiçbir dosyaya yazma; canvas dışında hiçbir Slack yüzeyine yazma.
- Hiçbir git commit / push / branch komutu çalıştırma — sadece `pull` ve okuma.
