# Routine Prompt - Skill Catalog Güncelle

Vertigo'nun skill kataloğunu tek kaynaktan senkron tut: VertigoAI reposundaki `docs/SKILL_CATALOG.md`. Ekip kataloğu bu dosyadan çizilen sayfada görür (Stats sunucusu, `/skill-catalog/`); sayfa dosyayı her açılışta okur, ona ayrıca bir şey yazmazsın. Değişiklik yoksa hiçbir şeye dokunmadan çık.

## Sabitler

- **Repo:** `~/GitHub/VertigoAI` (branch: `main`; `~` = bu makinedeki HOME)
- **Katalog dosyası:** `docs/SKILL_CATALOG.md`
- **Manifest:** `plugin-list.json` (marketplace + plugin listesi; tek doğruluk kaynağı)
- **Vertigo skill kaynakları:** `plugins/vertigo-core-skills/skills/*/SKILL.md`, `plugins/vertigo-extra-skills/skills/*/SKILL.md` (ileride `plugins/vertigo-*-skills` deseninde yenileri gelebilir — hepsini tara)
- **Harici pluginler:** kataloglanacak plugin listesi DOĞRUDAN `plugin-list.json`'ın `plugins` alanından gelir (vertigo marketplace'inden olmayanlar). Her birinin skill adı/açıklaması için kurulu kopyasına bak: `installPath` = `$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json` (`CLAUDE_CONFIG_DIR` boşsa `~/.claude`); önce `.claude-plugin/plugin.json` içindeki `skills` alanı, yoksa `skills/` + `commands/` klasörleri (caveman'in `caveman-init`'i bir command'dir ve kataloğa dahildir). Manifest'te olup makinede kurulu olmayan plugin varsa önce `claude plugin install <plugin> --scope user` ile kur, sonra katalogla.
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
5. Başlığın hemen altındaki "Bu tablo **Reflex** tarafından düzenli aralıklarla güncellenir. **Son güncelleme:** <tarih saat>" satırında, içerik değişikliği yaptığın her koşuda tarihi koşu zamanıyla güncelle; satırın geri kalan metnine dokunma (sayfa tarihi bu satırdan okur).
6. Dosyayı kaydet, bu kadar — **commit veya push YAPMA**. Raporda "SKILL_CATALOG.md güncellendi, commit bekliyor" diye belirt.

## Kapanış

1. `skill_catalog_state.json`'a yeni imzayı yaz.
2. Kısa rapor: ne değişti (plugin/skill adları), hangi tablolar güncellendi. Değişiklik yoksa "no-op".

## Guardrail'ler

- İdempotent ol: üst üste koşmak zarar vermemeli; emin olmadığın durumda değişiklik yapmadan raporla.
- SKILL_CATALOG.md'de beklenmeyen yapı görürsen (Skill Catalog H1'i yok, tablolar elle bozulmuş vb.) tahminle düzeltmeye çalışma — durumu raporla ve çık.
- Sayfa dosyanın yapısına bağlıdır: her plugin bir `## <Plugin adı>` başlığı, altında `|` ile başlayan tablo satırları. Bu yapıyı bozma.
- Repo'da `docs/SKILL_CATALOG.md` dışında hiçbir dosyaya yazma; Slack'e (canvas dahil) hiçbir şey yazma.
- Hiçbir git commit / push / branch komutu çalıştırma — sadece `pull` ve okuma.
