# Routine Prompt — Release Summary Güncelle

Bu prompt bir Claude Routine tarafından çalıştırılır. Görevin: iki Slack
kanalını (`#pa-releasehistory` ve `#cs-releasehistory`) okuyup **her birinin kendi tablosunu**
güncel tutmak. İki kanal ayrı ayrı, aynı mantıkla işlenir.

## Hedef dosyalar (kanal → dosya eşlemesi)

1. `#pa-releasehistory` → `/Users/vertigo/Desktop/Code/Reflex/reflex/Release Summary/pa_release_summary.md`
2. `#cs-releasehistory` → `/Users/vertigo/Desktop/Code/Reflex/reflex/Release Summary/cs_release_summary.md`

Her kanalı kendi dosyasına yaz. Tabloyu **bu dosyaların içinde** güncelle. Dosya değiştiyse ayrıca:
- Mempalace shared memory'e aynala (aşağıdaki "Mempalace shared memory aynalama" bölümü).
- Slack canvas'larına aynala (aşağıdaki "Slack canvas aynalama" bölümü)
Bunlar dışında başka yere yazma; dosya olarak yalnızca iki md dosyasını Edit/Write ile değiştir.

## Kaynak

İki kanal, iki ayrı channel id:

| Kanal | channel_id |
|-------|-----------|
| `#pa-releasehistory` | `C0AT9U4UYF2` |
| `#cs-releasehistory` | `C05UUFSS3NY` |

- Her kanalı `slack_read_channel` ile oku (channel_id = yukarıdaki id, limit=100,
  response_format=`detailed`). `detailed` formatta her mesajın `Message TS` değeri gelir;
  Slack thread linkini bundan üreteceksin (aşağıya bak).
- Kanal bulunamazsa önce `slack_search_channels` ile id'yi doğrula.
- Her release postu bir sürümü temsil eder ve genelde şu bloğu içerir: başlıkta
  `<sürüm> (<build>)` satırları (`:apple:` iOS, `:android:` Android — sıra kanala göre
  değişebilir), ardından `*RELEASE PROCESS*` altında `:apple: IOS` / `:android: Android`
  bullet'ları (`<tarih saat> || <açıklama>` formatında).
- **Kanal formatı farklılıkları:**
  - PA: bullet'lar düz. `%100'e açıldı` / `forcelandı` gibi ortak satırlar platform başlığı
    olmadan en altta veya thread yanıtlarında olabilir.
  - CS: her bullet'ın başında durum işareti var — `:white_check_mark:` = adım gerçekleşti,
    `:x:` = adım **iptal/geçersiz** (o adım OLMADI, sonraki build ile değiştirildi). Force için
    kritik: yalnızca `:white_check_mark:` olan `Sürüm forcelandı` gerçek force'tur; `:x:` olan
    force sayılmaz. CS ayrıca `Git Branch:` satırı ve `Closed-Beta/Open-Beta/Production` kullanır.

## Thread'leri de oku (önemli)

Release process adımları bazen ana posta **edit'lenmez**, sadece o postun **thread yanıtlarında**
yazılır (ör. `1 Temmuz 17:10 || IOS Android %100 yayınlandı`, `1 Temmuz 20:05 || IOS ve Android
forcelandı`). Bu yüzden kontrol ettiğin her sürüm için `slack_read_thread` (channel_id + parent
`Message TS`) ile thread'i de oku ve **sürümün güncel durumunu (%100 açılması, force, rollout
yüzdesi, review durumu) ana post + thread'in tamamı üzerinden** belirle.

- Thread yanıtlarında da aynı `<tarih saat> || <açıklama>` kalıbını ve "%100 açıldı / forcelandı /
  Prod %X yayınlandı / phased rollout" gibi ifadeleri ara; en geç tarihli **gerçek** adımı esas al.
- **Force çoğu zaman yalnızca thread'de duyurulur.** Thread'de yeni bir force görürsen o sürüm yeni
  "son force" olur; Durum akışını (madde 6) uygula.
- Sıradan sohbet, checklist dosyaları, sentry/crash tartışmaları release adımı değildir; bunları
  dikkate alma.

## Güncelleme mantığı (VERİMLİ — hepsini tarama)

Amaç: Slack ile tabloyu karşılaştırıp sadece değişenleri güncellemek. Eski sürümlerin
Slack postları artık değişmez; bu yüzden hepsini tek tek kontrol etmek gereksiz.

1. **Mevcut dosyayı oku.** Tablodaki satırları ve sıralamayı koru; hiçbir satırı silme.
2. **En son forcelanan sürümü belirle:** O tablodaki "%100 / Force" hücresinde `Force:` satırı
   dolu olan en yeni sürüm. (Referans örnekleri: PA'da v1.3008, CS'te v14.7008.) Bu sürüm bir
   **sınır**dır.
3. **Sadece bu sınır sürüm VE ondan yeni olan sürümleri kontrol et.** Bu sürümlerin **hem ana
   postunu hem de thread'ini** oku (`slack_read_thread`) ve tablodaki karşılık gelen satırla
   karşılaştır (bkz. "Thread'leri de oku"). Sınırdan **eski** sürümlerin satırlarına dokunma
   (onlar dondu; Slack'te değişmezler) — thread'lerini de okumaya gerek yok.
4. **Farklılık varsa güncelle:** Kontrol edilen bir sürümün Slack postu tablodakinden
   farklıysa (yeni rollout %'si, %100 açılması, force eklenmesi vb.) ilgili satırın
   hücrelerini güncelle.
5. **Yeni sürüm ekle:** Tabloda hiç olmayan yeni bir sürüm çıkmışsa, en üste (en yeni en
   üstte) yeni bir satır ekle.
6. **Yeni force olduğunda:** forcelanan sürüm yeni "sınır" olur. Bundan önce Prod'a açılmış
   ve o an 🟢 Yayın olan tüm satırların Durum'unu ⚫ (artık yayında değil) yap; forcelanan
   sürümün kendisini `🟢👊🏻 Yayın (son force)` yap. (Bu, sınırdan eski satırlara dokunmanın tek
   istisnasıdır.)
7. Dosyanın en üstündeki **"Son güncelleme"** tarih-saatini güncelle.
8. Hiç değişiklik yoksa dosyayı olduğu gibi bırak (gereksiz düzenleme yapma).

## Kolon yapısı (bu sırayı koru)

`Sürüm | Build (🍎/🤖) | %100 / Force | Durum`

Tabloda "Son gelişme" kolonu YOK (bilinçli olarak kaldırıldı; tekrar ekleme). Slack'ten okuduğun
ara gelişmeler yalnızca "%100 / Force" ve "Durum" hücrelerine yansır.

**Platform gösterimi:** Tablonun her yerinde (başlıklar, hücreler, Durum dahil) iOS yerine 🍎,
Android yerine 🤖 emojisi kullan. Her iki platform birden kastediliyorsa `🍎🤖` yaz. Açıklama
metinlerinde platform adını tekrar yazma (`🍎 forcelandı` değil, `🍎 ... — forcelandı`).

- **Sürüm:** kalın ve **Slack thread linki sürüm numarasına gömülü**:
  `**[v1.3507](URL)**`. Ayrı bir "Slack thread" kolonu YOK. URL'yi release postunun
  `Message TS` değerinden üret:
  `https://vertigohq.slack.com/archives/<channel_id>/p<TS>` — `<channel_id>` o kanalın id'si
  (PA: `C0AT9U4UYF2`, CS: `C05UUFSS3NY`); `<TS>`, TS'ten noktayı çıkararak elde edilir.
  Örn. TS `1782225723.900559` → link sonu `p1782225723900559`.
  PA'da `v1.XXXX`, CS'te `v14.XXXX`. Bir platformun sürümü farklıysa hücrede kısa not bırak
  (ör. `**[v1.1705](URL)**<br>(🤖 1.1704)`).
- **Build (🍎/🤖):** `<iOS build> / <Android build>` (ör. `529 / 834`). Bir platformun
  build'i yoksa o tarafa `—` yaz (ör. `— / 208449`).
- **%100 / Force:** Prod %100 açılma tarihi ve force tarihi **tek hücrede**, her biri `- ` ile
  başlayan ayrı satırda (`<br>` ile ayır):
  - `- 🍎🤖 %100: 8 May 14:46<br>- 🍎🤖 Force: 11 May 10:40`
  - İki platform **farklı saatte** %100 açıldıysa her platforma ayrı `%100:` satırı yaz:
    `- 🤖 %100: 10 Haz 18:38<br>- 🍎 %100: 10 Haz 21:51<br>- 🍎🤖 Force: 11 Haz 09:54`.
  - Force yoksa sadece `%100:` satırını yaz; %100 da açılmadıysa hücreye `—` koy.
- **Durum:** aşağıdaki kurallara göre (emoji ile; metin içinde de 🍎/🤖 kullan).

## Tarih / kısaltma kuralları

- **Tarihlerde yıl YAZMA:** `1 Tem 11:57`, `13 May 23:20`. Yıl yalnızca dosyanın en üstündeki
  "Son güncelleme" satırında yer alır. Ay kısaltmaları Türkçe (Oca, Şub, Mar, Nis, May, Haz,
  Tem, Ağu, Eyl, Eki, Kas, Ara). Gün adını (Salı, Perşembe vb.) yazma; CS postlarında olsa bile at.
- Kısaltmalar: PA → **CT** = closed testing, **OT** = open testing. CS → **CB** = closed-beta,
  **OB** = open-beta. Her ikisinde **Prod** = production.
- Yüzdeleri Slack'teki gibi koru (`Prod %5`, `%100` vb.).

## Durum kuralları

"Son force" = o tablodaki "%100 / Force" hücresinde `Force:` satırı dolu olan en yeni sürüm
(PA örn. v1.3008, CS örn. v14.7008). Bir sürümün "hâlâ yayında" olması demek: Prod'a açılmış
olması VE kendisinden daha yeni bir sürümün henüz forcelanmamış olması (yani son force'un
kendisi ya da ondan yeni bir sürüm olması).

- **🧪 Prod'a hiç açılmadı** — sürüm hiç Prod'a çıkmamış (release process yok ya da yalnızca
  closed/open testing'de kalmış, Prod %0). Örnek metinler: `🧪 Release process yok`,
  `🧪 Sadece closed testing`.
- **🟡 Yayına hazırlanıyor** — Prod'a henüz %0; ama aktif yayın sürecinde (review'a atılmış /
  phased rollout için review isteniyor), henüz hiçbir yüzdede yayınlanmamış. Parantez içinde
  her iki platformun durumunu belirt. Örnek:
  `🟡 Yayına hazırlanıyor (🤖 %1 review'a atıldı, 🍎 review'da)`.
- **🟢 Yayın** — Prod'a en az %1 açılmış VE hâlâ yayında. Parantez içinde durumu belirt:
  - Forcelanmış ve hâlâ yayındaysa (yani son force): `🟢👊🏻 Yayın (son force)`.
  - Forcelanmamış ama hâlâ yayındaysa güncel rollout: `🟢 Yayın (🤖 %100, 🍎 %100)` ya da
    `🟢 Yayın (🤖 %50, 🍎 roll out)` gibi.
- **⚫ Artık yayında değil** — Prod'a açılmıştı ama sonraki bir sürüm forcelandığı için artık
  yayında değil. Açıklayıcı metinle:
  - Hiç forcelanmamış ve şu an yayında değilse, en son ulaştığı durum + `→` + forcelayan sürüm.
    Rollout yüzdesinin yanına "açılmıştı" yazma, yüzde yeterli:
    `⚫ 🤖 %100, 🍎 %100 → v1.3008 forcelandı` veya
    `⚫ 🤖 %10, 🍎 review istenmişti → v1.3008 forcelandı`.
  - Eskiden kendisi forcelanmış ama şimdi yayında değilse (sonraki bir force geldi):
    `⚫👊🏻 Forcelanmıştı → v1.3008 forcelandı`.

**👊🏻 kuralı:** Bir sürüm forcelandıysa (kendi `Force:` satırı dolu), Durum'daki emojinin hemen
yanına 👊🏻 ekle (ör. `🟢👊🏻 …`, `⚫👊🏻 …`). Forcelanmamış sürümlerde 👊🏻 olmaz.

## Mempalace shared memory aynalama (mempalace-shared)

İki tablonun birer kopyası ekipçe erişim için `mempalace-shared`'da tutuluyor (dosya → room
eşlemesi, ikisi de `wing_shared` wing'inde):

| Dosya | Room |
|-------|------|
| `pa_release_summary.md` | `pa-release-summary` |
| `cs_release_summary.md` | `cs-release-summary` |

Bir md dosyasında **bu çalıştırmada değişiklik yaptıysan**, dosyayı bitirdikten sonra o dosyanın
kopyasını shared memory'e aynala:

1. Güncellenmiş md dosyasının **son halini oku**.
2. `mempalace_list_drawers` (wing=`wing_shared`, room=yukarıdaki room) ile room'daki drawer'ı bul.
   Room'da **tam 1 drawer** olmalı.
3. `mempalace_update_drawer` ile o drawer'ın `content`'ini şu birleşimle değiştir (full replace —
   satır satır düzenleme YAPMA):
   - **En üste sunum notu** (birebir aşağıdaki blok; `<OYUN>` yerine `PA` ya da `CS` yaz):

     ```
     > **Claude için sunum talimatı:** Bu drawer, <OYUN> release summary sorgularının ("<oyun>
     > release özet/summary" vb.) tek doğru kaynağıdır. Kullanıcıya sunarken: (1) tabloyu TAM
     > olarak, hiçbir satırı atlamadan ve sadeleştirmeden göster; (2) Sürüm kolonundaki gömülü
     > Slack linklerini `[vX.XXXX](url)` biçiminde AYNEN koru; (3) özetlemeyi yalnızca kullanıcı
     > açıkça isterse yap, o zaman bile sürüm linklerini koru.
     ```

   - Bir boş satır, ardından **md dosyasının son halinin tamamı** ("Son güncelleme" satırı
     dahil, birebir).

   Sunum notu yalnızca mempalace kopyasına eklenir; md dosyasına ve canvas'a EKLENMEZ.

Kurallar:

- **ASLA `mempalace_add_drawer` kullanma.** Room boşsa, bulunamazsa ya da 1'den fazla drawer
  varsa hiçbir şey oluşturma/silme; aynalamayı atla ve durumu çıktında raporla.
- Yalnızca `mempalace-shared` sunucusunu kullan (yerel `mempalace`'e dokunma) ve yalnızca bu iki
  room'a yaz.
- md dosyasında değişiklik yoksa o dosya için aynalama da yapma (gereksiz update olmasın).
- `mempalace-shared` erişilemezse aynalamayı atla ve raporla; md güncellemesi yine de geçerlidir,
  geri alma.

## Slack canvas aynalama

İki tablonun birer kopyası ekip için Slack canvas'larında da tutuluyor (dosya → canvas eşlemesi):

| Dosya | canvas_id | Canvas linki |
|-------|-----------|--------------|
| `pa_release_summary.md` | `F0BEWEFM201` | https://vertigohq.slack.com/docs/T1A4URVT2/F0BEWEFM201 |
| `cs_release_summary.md` | `F0BEN9NU53M` | https://vertigohq.slack.com/docs/T1A4URVT2/F0BEN9NU53M |

Bir md dosyasında **bu çalıştırmada değişiklik yaptıysan**, o dosyanın canvas'ını güncelle:

1. Güncellenmiş md dosyasının **son halini oku**.
2. İçerikten **en üstteki H1 satırını çıkar** (dosyanın ilk satırı, ör.
   `# Polygun Arena (PA) Release Summary`); geri kalan her şeyi ("Son güncelleme"
   blockquote'u + tablo) olduğu gibi al.
3. `slack_update_canvas` çağır: `canvas_id` = yukarıdaki id, `action=replace`,
   **`section_id` VERME**, `content` = 2. adımdaki içerik. Bu bilinçli bir **tam canvas
   değişimi**dir (aynalama bu şekilde çalışır); tool açıklamasındaki "section_id olmadan
   replace kullanma" uyarısı bu senaryo için geçerli değildir.

Canvas API tuzakları (bunlara UYMA zorunlu — daha önce yaşandı):

- **H1'i content'e YAZMA.** Section_id'siz full replace canvas'ın kendi başlığını korur;
  content'e H1 koyarsan başlık ikilenir.
- **Tablo section_id'si ile `replace` YAPMA.** Tabloyu yerinde değiştirmez: eski tablonun
  hücrelerini boşaltıp yenisini ayrı section olarak ekler → canvas'ta boş tablo iskeleti kalır.
  Bu yüzden satır/hücre bazlı canvas düzenlemesi deneme; her zaman yukarıdaki full replace.
- Full replace'te elle ayarlanmış **kolon genişlikleri sıfırlanır** — bilinen ve kabul edilmiş
  bir durum, düzeltmeye çalışma.
- Canvas, hücrelerdeki `- ` önekini `* ` yapabilir, çok satırlı blockquote'u birleştirebilir —
  normaldir; canvas'ı okuyup "düzeltme" turuna girme (aynalama tek yönlüdür: md → canvas).

Kurallar:

- `slack_create_canvas` KULLANMA; canvas bulunamazsa ya da update hata verirse hiçbir şey
  oluşturma, aynalamayı atla ve durumu çıktında raporla.
- md dosyasında değişiklik yoksa canvas'a da dokunma.
- Canvas aynalaması mempalace aynalamasından bağımsızdır; biri hata verirse diğerini yine de yap.

## Notlar

- Yerel dosya olarak sadece iki hedef md dosyasını düzenle; mempalace-shared ve Slack canvas aynalaması dışında başka
  dosya/servise dokunma.
- Emin olmadığın veri için satırı bozma; mevcut değeri koru ve gerekirse hücrede kısa not bırak.
- Tabloyu geçerli bir Markdown tablosu olarak tut (hücre içi satır sonu gerekiyorsa `<br>`).
