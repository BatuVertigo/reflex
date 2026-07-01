# Routine Prompt — PA Sürüm Geçmişi Tablosunu Güncelle

Bu prompt bir Claude Routine (thrice daily) tarafından çalıştırılır. Görevin: Slack
`#pa-releasehistory` kanalını okuyup **tek bir dosyadaki tabloyu** güncel tutmak.

## Hedef dosya

`/Users/vertigo/Desktop/Code/Reflex/reflex/release_history_table.md`

Tabloyu **bu dosyanın içinde** güncelle. Başka yere yazma, mempalace'e ekleme yapma.
Sadece bu dosyayı Edit/Write ile değiştir.

## Kaynak

- Slack kanalı: `#pa-releasehistory`, channel id `C0AT9U4UYF2`.
- Slack MCP ile oku: `slack_read_channel` (channel_id=`C0AT9U4UYF2`, limit=100,
  response_format=`detailed`). `detailed` formatta her mesajın `Message TS` değeri gelir;
  Slack thread linkini bundan üreteceksin (aşağıya bak).
  Kanal bulunamazsa önce `slack_search_channels` ("pa-releasehistory") ile id'yi doğrula.
- Her release postu bir sürümü temsil eder ve genelde şu bloğu içerir:
  başlıkta `:apple: <sürüm> (<iOS build>)` ve `:android: <sürüm> (<Android build>)`,
  ardından `*RELEASE PROCESS*` altında `:apple: IOS` ve `:android: Android` bullet'ları
  (`<tarih saat> || <açıklama>` formatında).

## Güncelleme mantığı (VERİMLİ — hepsini tarama)

Amaç: Slack ile tabloyu karşılaştırıp sadece değişenleri güncellemek. Eski sürümlerin
Slack postları artık değişmez; bu yüzden hepsini tek tek kontrol etmek gereksiz.

1. **Mevcut dosyayı oku.** Tablodaki satırları ve sıralamayı koru; hiçbir satırı silme.
2. **En son forcelanan sürümü belirle:** Tabloda "Force tarihi" dolu olan en yeni sürüm
   (şu an referans: v1.3008). Bu sürüm bir **sınır**dır.
3. **Sadece bu sınır sürüm VE ondan yeni olan sürümleri kontrol et.** Bu sürümlerin Slack
   postlarını oku ve tablodaki karşılık gelen satırla karşılaştır. Sınırdan **eski**
   sürümlerin satırlarına dokunma (onlar dondu; Slack'te değişmezler).
4. **Farklılık varsa güncelle:** Kontrol edilen bir sürümün Slack postu tablodakinden
   farklıysa (yeni rollout %'si, %100 açılması, yeni son gelişme, force eklenmesi vb.)
   ilgili satırın hücrelerini güncelle.
5. **Yeni sürüm ekle:** Tabloda hiç olmayan yeni bir sürüm çıkmışsa, en üste (en yeni en
   üstte) yeni bir satır ekle.
6. **Yeni force olduğunda:** forcelanan sürüm yeni "sınır" olur. Bundan önce Prod'a açılmış
   ve o an 🟢 Yayın olan tüm satırların Durum'unu ⚫ (artık yayında değil) yap; forcelanan
   sürümün kendisini `🟢👊🏻 Yayın (son force)` yap. (Bu, sınırdan eski satırlara dokunmanın tek
   istisnasıdır.)
7. Dosyanın en üstündeki **"Son güncelleme"** tarih-saatini güncelle.
8. Hiç değişiklik yoksa dosyayı olduğu gibi bırak (gereksiz düzenleme yapma).

## Kolon yapısı (bu sırayı koru)

`Sürüm | Slack thread | Build (iOS/Android) | Son gelişme (iOS) | Son gelişme (Android) | %100 açıldı | Force tarihi | Durum`

- **Sürüm:** `v1.XXXX` (kalın).
- **Slack thread:** İlgili release postunun linki, `[Link](URL)` şeklinde gömülü. URL'yi
  mesajın `Message TS` değerinden üret:
  `https://vertigohq.slack.com/archives/C0AT9U4UYF2/p<TS>` — buradaki `<TS>`, TS'ten
  noktayı çıkararak elde edilir. Örn. TS `1782225723.900559` → link sonu `p1782225723900559`.
- **Build (iOS/Android):** `<iOS build> / <Android build>` (ör. `529 / 834`).
- **Son gelişme (iOS) / (Android):** İlgili platformun **en son gelişmesini** tek satırda yaz:
  `• <tarih saat> — <açıklama>`. Bunu belirlerken:
  - Önce platformun kendi bölümündeki (`:apple: IOS` / `:android: Android`) **son maddeye** bak.
  - **AMA** postun altında platform başlığı olmadan yazılmış **ortak satırlar** olabilir
    (ör. `24 Haziran 16:25 || IOS/Android %100'e açıldı`, `25 Haziran 16:35 || IOS/android
    forcelandı`). Bu ortak satırlar hem iOS hem Android için geçerlidir ve genelde en son
    gelişmedir. Böyle bir satır varsa, ilgili platformun son gelişmesi olarak **onu** yaz
    (ör. Son gelişme (Android) = `• 25 Haz 2026 16:35 — Android forcelandı`,
    Son gelişme (iOS) = `• 25 Haz 2026 16:35 — iOS forcelandı`).
  - Yani her platform için "en geç tarihli gelişme" hangisiyse onu yaz.
  - İlgili platformda hiç gelişme yoksa sadece `—` koy.
- **%100 açıldı:** Prod %100 açıldığı tarih + yanına `(iOS & Android)` / `(iOS)` / `(Android)`.
  Açılmadıysa `—`.
- **Force tarihi:** `forcelandı` olduğu tarih + `(iOS & Android)` vb. Yoksa `—`.
- **Durum:** aşağıdaki kurallara göre (emoji ile).

## Tarih / kısaltma kuralları

- **Tarihe her zaman yıl yaz:** `1 Tem 2026 11:57`, `13 May 2026 23:20`. Ay kısaltmaları
  Türkçe (Oca, Şub, Mar, Nis, May, Haz, Tem, Ağu, Eyl, Eki, Kas, Ara).
- Kısaltmalar: **CT** = closed testing, **OT** = open testing, **Prod** = production.
- Yüzdeleri Slack'teki gibi koru (`Prod %5`, `%100` vb.).

## Durum kuralları

"Son force" = tabloda "Force tarihi" dolu olan en yeni sürüm (şu an v1.3008). Bir sürümün
"hâlâ yayında" olması demek: Prod'a açılmış olması VE kendisinden daha yeni bir sürümün henüz
forcelanmamış olması (yani son force'un kendisi ya da ondan yeni bir sürüm olması).

- **🧪 Prod'a hiç açılmadı** — sürüm hiç Prod'a çıkmamış (release process yok ya da yalnızca
  closed/open testing'de kalmış, Prod %0). Örnek metinler: `🧪 Release process yok`,
  `🧪 Sadece closed testing`.
- **🟡 Yayına hazırlanıyor** — Prod'a henüz %0; ama aktif yayın sürecinde (review'a atılmış /
  phased rollout için review isteniyor), henüz hiçbir yüzdede yayınlanmamış. Parantez içinde
  her iki platformun durumunu belirt. Örnek:
  `🟡 Yayına hazırlanıyor (Android %1 review'a atıldı, iOS review'da)`.
- **🟢 Yayın** — Prod'a en az %1 açılmış VE hâlâ yayında. Parantez içinde durumu belirt:
  - Forcelanmış ve hâlâ yayındaysa (yani son force): `🟢👊🏻 Yayın (son force)`.
  - Forcelanmamış ama hâlâ yayındaysa güncel rollout: `🟢 Yayın (Android %100, iOS %100)` ya da
    `🟢 Yayın (Android %50, iOS roll out)` gibi.
- **⚫ Artık yayında değil** — Prod'a açılmıştı ama sonraki bir sürüm forcelandığı için artık
  yayında değil. Açıklayıcı metinle:
  - Hiç forcelanmamış ve şu an yayında değilse, en son ulaştığı durumu + forcelayan sürümü yaz:
    `⚫ Android %100, iOS %100 açılmıştı, sonra v1.3008 forcelandı` veya
    `⚫ Android %10 açılmıştı, iOS review istenmişti, sonra v1.3008 forcelandı`.
  - Eskiden kendisi forcelanmış ama şimdi yayında değilse (sonraki bir force geldi):
    `⚫👊🏻 Forcelanmıştı, sonra v1.3008 forcelandı`.

**👊🏻 kuralı:** Bir sürüm forcelandıysa (kendi "Force tarihi" dolu), Durum'daki emojinin hemen
yanına 👊🏻 ekle (ör. `🟢👊🏻 …`, `⚫👊🏻 …`). Forcelanmamış sürümlerde 👊🏻 olmaz.

## Notlar

- Sadece hedef dosyayı düzenle; başka dosya/servis dokunma.
- Emin olmadığın veri için satırı bozma; mevcut değeri koru ve gerekirse hücrede kısa not bırak.
- Tabloyu geçerli bir Markdown tablosu olarak tut (hücre içi satır sonu gerekiyorsa `<br>`).
