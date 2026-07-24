# Routine Prompt — Bug Watcher

> Her sabah çalışan "Bug Watcher Routine"inin tek doğruluk kaynağı bu dosyadır.
> Bu dosyayı düzenleyerek Routine'i istediğiniz şekilde değiştirmiş olursunuz.

---

## 0. Çalıştırma ayarları

- **Zamanlama:** Routine ne zaman runlanırsa.
- **Çalışma sırası:** her run üç aşamadan oluşur:
  1. **Backlog gözden geçirme** (§6) — bir önceki raporun backlog listesindeki thread'leri yeniden değerlendir.
  2. **Yeni thread taraması** — §1'deki kanalların son 24 saatteki ana mesajlarını incele (aşağıdaki "Geriye bakış").
  3. **Gün sonu raporu** (§7) — backlog'un güncel halini #reflex kanalına raporla.
- **Geriye bakış:** Kanala **son 24 saatte** atılmış ana mesajlara (top-level mesaj) bak; her birinin thread yanıtlarını da oku.
- **Deneme modu (dry-run):** `false`
  - `true` olduğunda ajan tüm analizi yapar ama Slack'e **hiçbir yanıt yazmaz** —
    sadece ne yapacağını raporlar. Test ederken bunu `true` yapabilirsin.
- **Araçlar:** Bu Routine, bağlı **Slack MCP** (mesaj/thread/reaction okuma, kullanıcı
  çözümleme) ve **Asana MCP** (proje/task arama) connector'larını **yalnızca okuma**
  için kullanır. Asana'ya **hiçbir şey yazmaz/oluşturmaz**. Slack'e mesaj **gönderme**
  connector ile YAPILMAZ (connector kullanıcı adına atar) — tüm gönderimler §0a'daki
  yöntemle, **Reflex app kimliğiyle** yapılır.
- **Yanıt yeri:** Tüm yanıtlar ilgili bug mesajının **kendi thread'ine yanıt** olarak
  yazılır; bug kanallarına yeni (top-level) mesaj atılmaz.
  **Tek istisna:** gün sonu backlog raporu (§7), rapor kanalı **#reflex**'e top-level
  mesaj olarak atılır.
- **Dil:** Botun tüm Slack çıktıları **Türkçe**.

---

## 0a. Mesaj gönderme yöntemi (Reflex app kimliği)

Slack'e yazılan **her mesaj** (thread yanıtları + §7 raporu) **Reflex Slack app'inin
bot token'ı** ile `chat.postMessage` üzerinden gönderilir; böylece mesajlar Slack'te
**Reflex** adına görünür. Slack MCP connector'ının mesaj atma araçları
(`slack_send_message` vb.) **asla kullanılmaz** — onlar kullanıcı adına atar.

**Token:** `/Users/vertigo/Desktop/Code/Reflex/reflex/.env` içindeki
`SLACK_BOT_TOKEN`. Token'ı **asla** ekrana, loga veya run çıktısına yazma; yalnızca
`Authorization` header'ında kullan.

**Gönderim adımları:**

1. Mesaj içeriğini geçici bir JSON dosyasına yaz — dosyayı oturumun scratchpad/temp
   dizinine koy, repo içine yazma (tırnak/Türkçe karakter kaçış hatalarını önlemek
   için payload her zaman dosyadan verilir):

   ```json
   {"channel": "<kanal ID>", "thread_ts": "<ana mesajın ts değeri>", "text": "<mesaj>"}
   ```

   - **Thread yanıtı:** `thread_ts` = yanıtlanan ana (top-level) mesajın `ts` değeri.
   - **Gün sonu raporu (§7):** `channel` = `C0BFP48BMBK` (#reflex), `thread_ts` alanı
     payload'a **konmaz** (top-level mesaj).
   - Etiket formatları metinde aynen kullanılır: `<@U...>`, `<!subteam^S...>`.
   - `text` alanı Slack **mrkdwn** formatında yazılır — bu dosyadaki şablon ve örnek
     cümlelerdeki markdown, gönderim sırasında çevrilir:
     - Link: `<https://...|görünen metin>` (markdown `[metin](url)` DEĞİL).
     - Kalın: `*metin*` (çift yıldız `**metin**` DEĞİL).

2. Gönder:

   ```bash
   source /Users/vertigo/Desktop/Code/Reflex/reflex/.env
   curl -s -X POST https://slack.com/api/chat.postMessage \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     -H "Content-type: application/json; charset=utf-8" \
     -d @<payload dosyası>
   ```

3. Yanıttaki `"ok"` alanını kontrol et. `"ok": false` ise:
   - Hatayı (`error` alanı) run çıktısında raporla ve o mesajı gönderilmemiş say.
   - **Connector'ın mesaj atma araçlarına GERİ DÜŞME** — hiçbir koşulda mesaj
     kullanıcı adına atılmaz. Gönderilemeyen mesaj rapor/çıktıda belirtilir.

**Dry-run kapısı değişmez:** dry-run `true` iken bu curl çağrıları dahil Slack'e
**hiçbir yazma yapılmaz**; yalnızca gönderilecek payload'lar run çıktısında gösterilir.

---

## 1. Slack kanalları

| Oyun | Kanal | ID | Workspace | Etiketlenecek ekip |
|---|---|---|---|---|
| Polygun Arena | #qa-polygunarena | `C0636S9C278` | vertigohq.slack.com | `@pa-product` |
| Polygun Arena | #community-feedback_polygun-arena | `C09S20F1V7E` | vertigohq.slack.com | `@pa-product` |

> İstediğiniz kanalları yeni satır olarak ekleyebilirsiniz.
> Ajan her kanalın son 24 saatteki ana mesajlarını ve thread yanıtlarını okur.

### 1a. Ekip usergroup ID'leri

| Ekip | Usergroup ID | Etiket formatı |
|---|---|---|
| `@pa-product` (Polygun Arena) | `S09ADDKDVND` | `<!subteam^S09ADDKDVND>` |
| `@cs-product` (Critical Strike) | `S09ADDHBTC1` | `<!subteam^S09ADDHBTC1>` |

### 1b. Ekip üyeleri (kim hangi ekipte)

Bu tablo §5b'deki "ekip yerine kişi" kontrolü için kullanılır.

**`@pa-product` üyeleri:**

| İsim | Slack ID | Etiket |
|---|---|---|
| Yigit Sahinkoc | `U057RT05UKA` | `<@U057RT05UKA>` |
| Batuhan Büber | `U0AQYJRJCSV` | `<@U0AQYJRJCSV>` |
| Yiğit Hamdi Yildirim | `U086CLB5JUX` | `<@U086CLB5JUX>` |
| kerem kahya | `U09LLNU21BR` | `<@U09LLNU21BR>` |
| Akif İnce | `U0AG2C15XB7` | `<@U0AG2C15XB7>` |
| Hasan Öztekin | `U0BBNAU7Q93` | `<@U0BBNAU7Q93>` |

**`@cs-product` üyeleri:**

| İsim | Slack ID | Etiket |
|---|---|---|
| Yigit Sahinkoc | `U057RT05UKA` | `<@U057RT05UKA>` |
| Berkay (Mehmet Berkay Alınç) | `U07SAQQ6VJB` | `<@U07SAQQ6VJB>` |
| Ali Serdar İlik | `U099Y94HW2H` | `<@U099Y94HW2H>` |
| Enes Engin Dereli | `U0A3D0UHH39` | `<@U0A3D0UHH39>` |
| Uygar Şahin | `U0BA0NMGGCF` | `<@U0BA0NMGGCF>` |
| Ozan Emre Arıkan | `U0BA0NMQEA3` | `<@U0BA0NMQEA3>` |

> Bu tablo yalnızca **ekip üyeliğini** bilmek için vardır. Tabloda olmayan biri
> thread'de aksiyon söz verdiyse (§3) onun ID'sini Slack'ten canlı çöz.

---

## 2. Kurallar

### 2a. Neyin takip edilmesi gerektiği

İki tür mesaj aday olarak değerlendirilir; **ikisi de aynı akıştan geçer**
(§2b atlama kontrolleri, §3, §4, §5, backlog):

**1) Bug:** oyunda bozuk, beklenmedik ya da tasarlandığı gibi çalışmayan bir şey.
Örnekler: çökme (crash), donma, yanlış değerler, eksik ödüller, UI hataları,
ağ/desync sorunları, repro adımları, bir hatanın ekran görüntüsü/videosu.

**2) Aksiyon gerektiren teknik iş:** hata bildirmese de yapılması gereken somut
bir teknik işi işaret eden mesajlar — tech-debt, bakım, ileriye dönük zorunlu iş.
Örnekler: "xxx eklemek lazım", "sonraki sezonda xxx yazmalıyız"; özellikle "önemli" / :red_circle: gibi
aciliyet vurgusu taşıyan notlar. Bunlar için §5 cümlelerinde "Bu bug için" yerine
"Bunun için" kullan — örn. "Bunun için task açılmasına gerek varsa açabilir miyiz
@etiket?"

**İkisi de DEĞİLDİR (atla):** genel sorular, sürüm notları, sohbet, övgü, "nasıl yaparım…".

Bir mesajın takip gerektirip gerektirmediğinden **emin değilsen** ekibe
sorabilirsin: "Bu mesaj takip edilmesi gereken bir konu mu emin olamadım, kontrol
eder misiniz? @etiket"

### 2b. Neyin "zaten ilgilenilmiş" sayıldığı (atla — YAZMA)
Aşağıdakilerden **herhangi biri** varsa bug'ı atla:
- ✅ onay emojisi = bug çözüldü ya da sorun olmadığına karar verildi.
- ❌ çarpı emojisi = bug ignore edilmeye karar verildi.
- ✏️ kalem emojisi = bug Asana'ya geçirilmiş.
  (Bu üç emoji yalnızca **ana mesaja reaction** olarak konmuşsa sayılır; thread
  yanıtlarındaki reaction'lar ve mesaj metninde geçen emojiler sayılmaz.)
- Ana mesajda veya thread yanıtlarında ilgili bug için Asana linki atılmış.
- Biri onaylayan bir yanıt yazmış: "düzeltildi", "task açıldı", "Asana taski açıldı", "hallettim", "bunu ignore edeceğiz", "bu bug değil", "bunu çözdük" gibi.
- Reflex'in hatırlatma sorusuna, sorulan aksiyonun yapıldığını bildiren bir yanıt
  gelmiş: "denedim", "test ettik", "x test etti" gibi. Yanıt olumsuz
  sonuç bildirmiyorsa (örn. "denedik, hala bozuk") ayrıca fix onayı arama —
  aksiyon tamamlanmış say, backlog'dan çıkar.

---

## 3. Birinden yanıt bekleniyor mu?

Thread'in son yanıtlarında belirli bir x kişisi:
1. "Bunu deneyeceğim."
2. "Bunu kontrol edeceğim."
3. "Bunun taskını açacağım."

diyerek kendisinin bir aksiyon alacağını söylemiş ve ondan yanıt bekleniyorsa,
bu kişi **ekip dışından biriyse**, x kişisini ve yanına ekipten bir muhatap da etiketle:
thread'e katılmış ekip üyelerinden ilgilenen biri varsa (§5b'deki "ilgilenmiş" ölçütleri)
**onu**, hiçbiri yoksa ekibin **usergroup** etiketini. Örn:
1. "Deneyebildin mi <@U7PFS9BB5>? <@U0AG2C15XB7>"
2. "Kontrol edebildin mi <@U7PFS9BB5>? <!subteam^S09ADDKDVND>"
3. "Taskı açabildin mi <@U7PFS9BB5>? <@U0AG2C15XB7>"

şeklinde kişi bazlı hatırlatma yap ve bu bug'ı geç.

> Güvenilir etiketleme için kişiyi adıyla değil **Slack üye ID'siyle** etiketle,
> formatı `<@U...>`. Kişi §1b tablosunda varsa oradaki ID'yi kullan; yoksa
> "Ben bakarım / deneyeceğim / taskını açacağım" diyen kişinin ID'sini **o an
> Slack'ten canlı çöz** (mesajın yazarından / kullanıcı arama ile).
---

## 4. Asana cross-check

- **Kapsam kuralı (ZORUNLU — önce oku, bir filtredir, tavsiye değil):** Bir bug'ı
  YALNIZCA ilgili oyunun kapsam içindeki Asana projelerindeki tasklarla eşleştir.
  Kapsam, ilgili Slack kanalının oyununa (§1) göre belirlenir:
  - **Polygun Arena** kanalı → adı **`PA` ile başlayan** projeler
    (örn. `PA v1.370 - Main Menu Changes`).
  - **Critical Strike** kanalı → adı **`CS` ile başlayan** projeler
    (örn. `CS v14.8 - Gangster Paradise`).
  Adı bu önekle **başlamayan** hiçbir proje kapsamda değildir. Özellikle eski
  `Version X.Y ...` isimli release projeleri (örn. `Version 12.2 - DONE`) **kapsam
  DIŞIDIR** — bunlardan gelen hiçbir task, ne kadar benzese de eşleşme olarak
  sunulamaz. Önek kontrolünü proje adının **baş/son boşlukları kırpılmış (trim)**
  haline uygula — örn. ` PA v1.010 - Arctic Siege` kapsam İÇİdir. Adında
  `Template` geçen projeler (örn. `PA Version Template`) release projesi
  değildir — **kapsam DIŞIDIR**.
- **Asana'da task tipi:** Açılan her task bir **type** taşır — **Task** veya **Approval**.
  Bir bug Asana'ya girildiğinde **Approval** olarak açılır ve fix durumu bu approval'ın
  **state**'inden okunur: `rejected`, `changes requested` veya `approved`. Fix durumunu
  **yalnızca bu state belirler** — `completed: true` approval'ın sonuçlandığını gösterir,
  fixlendiğini değil (`rejected` + `completed: true` → hâlâ fixlenmemiş, §5.1). Bir bug'ın benzerlerinin altında toplandığı **parent toplayıcı** ise normal **Task** tipindedir;
  bunu task'ın **ismi** ile bizim bug'ın içeriğini karşılaştırarak
  (anlamsal benzerlik) tespit et.
- **Eşleştirme mantığı:**
  1. Bu bug halihazırda Asana'ya girilmiş (**Approval** type) ve state'i `rejected` yani
     henüz fixlenmemiş → §5.1.
  2. Bu bug daha önce girilmiş (**Approval** type) ve state'i `changes requested` yani bu bug
     ile ilgili bir karar alınmış. Bu kararı commentleri okuyarak anlamaya çalış. → §5.2.
  3. Bu bug daha önce girilmiş (**Approval** type) ve state'i `approved`
     yani fixlenmiş → §5.3.
  4. Bu buga benzer bugların toplandığı bir **parent toplayıcı Task** var mı (isim +
     içerik eşleşmesi) → §5.4.
  - **Benzerlik eşiği:** Bir taskı 1–3 kapsamında "bu bug" saymak için **aynı
    semptom + aynı ekran/sistem** gerekir. Bitişik-ama-farklı semptomlu tasklar
    (örn. aynı ekranda ama başka bir öğeyi anlatan "TDM icon and Map icon
    overlaps") eşleşme olarak sunulMAZ; en fazla 4 (parent toplayıcı) adayı
    olarak değerlendirilir.
- **Arama yöntemi (önemli — kapsamı arama anında zorla):**
  1. **Önce kapsamdaki projeleri çıkar.** İlgili önekle (`PA` / `CS`) **başlayan**
     projeleri bul (proje arayıp adı bu önekle **başlayanları** süz) ve bunların
     **GID'lerini** topla. Bu, izin verilen proje kümesidir. Küme boşsa cross-check
     sonucu "eşleşme yok" kabul edilir.
  2. **Aramayı bu kümeyle sınırla.** `search_tasks`'i **`projects_any`**
     parametresine bu GID'leri (virgülle ayrılmış) vererek çağır — böylece sonuçlar
     yapısal olarak yalnızca kapsamdaki projelerden gelir. `search_objects`'e
     **güvenme** (yalnızca task ismiyle eşleşir, gerçek eşleşmeleri kaçırır); tam
     metin arayan **`search_tasks`** kullan (task ismi + açıklama + yorumları tarar).
     Approval/Task tipini gerekirse `resource_subtype` ile daralt.
  3. Anahtar kelimeleri **hem Türkçe hem İngilizce** dene (örn. `mor`/`purple`,
     `arka plan`/`background`, `pop-up`/`popup`), çünkü task içerikleri karışık dilde
     olabilir. Birden fazla sorgu varyasyonuyla ara; ilk boş sonuçta pes etme.
  4. **Sunmadan önce son doğrulama (belt-and-suspenders).** Bir taskı eşleşme olarak
     kullanmadan önce, taskın ait olduğu projelerin adlarını oku (`opt_fields`'e
     `projects.name` ekle) ve **en az bir** projesinin adının gereken önekle
     (`PA`/`CS`) başladığını doğrula. Başlamıyorsa o taskı **at — asla sunma.**
     **Subtask istisnası:** subtask'larda `projects` çoğu zaman `[]` döner — bu
     tek başına eleme sebebi DEĞİLDİR. `projects` boşsa `parent` zincirini yukarı
     yürü ve ilk projesi olan atanın projelerine aynı önek kontrolünü uygula.
     Zincirden de proje çıkmazsa, sonuç zaten `projects_any` ile kapsam
     projelerinden geldiği için taskı **geçerli say** (yapısal kısıta güven).
- Buradaki cross-check'ten bazı Asana taskları elde edilirse onlardan en son yanıtı oluştururken bahset.

---

## 5. Senaryolar

### Ne emoji ne yanıt hiçbir aksiyon verilmemiş:
- Asana cross-check'ten sonuç dönmedi:
  - "Bu bug için task açılmasına gerek varsa açabilir miyiz @etiket?"
- Asana cross-check'ten sonuç döndü:
  1. "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve hala fixlenmemiş gözüküyor. Kontrol edebilir misiniz @etiket?"
  2. "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve ... kararı alınmış gözüküyor. Kontrol edebilir misiniz @etiket?"
  3. "Bu bug daha önce Asana'ya [girilmiş](link) ve fixlenmiş gözüküyor. Kontrol edebilir misiniz @etiket?"
  4. "Bu tarz buglarım Asana'da [şu task](link) altında toplandığını gördüm. Belki subtask ekleyebiliriz veya yeni task açabiliriz @etiket"

### Konu tartışılmış:
- Sonuca bağlanmış, sadece task açılması unutulmuş:
  - "Bu bug için task açabilir miyiz @etiket?"
- Yarım kalmış, net olarak spesifik birinden yanıt beklenme durumu da yok:
  - "Bu konuyu netleştirip task açılmasına gerek varsa açabilir miyiz @etiket?"
- İleride bakılacağına dair bir şey söylenmiş:
  - "Unutulmaması adına task açmaya gerek varsa açabilir miyiz @etiket?"

> **Öncelik:** Asana cross-check (§4) sonuç döndüyse, senaryo "Konu tartışılmış"
> olsa bile Asana'lı cümleleri (1–4) kullan; "Konu tartışılmış" cümleleri
> yalnızca cross-check boş döndüğünde geçerlidir.

> `@etiket` yerine ilgili oyunun ekibini, §1a'daki **usergroup ID** formatıyla etiketle:
> Channel → `<!channel>`,
> Polygun Arena → `<!subteam^S09ADDKDVND>` (pa-product),
> Critical Strike → `<!subteam^S09ADDHBTC1>` (cs-product).
> Belirli bir kişiye dönüyorsan (§3 veya §5b) onun `<@U...>` ID'sini kullan.

### 5b. Ekibi etiketlemeden önceki son kontrol: acaba tek bir kişi mi?

§5'teki senaryolardan birine düşüp **ekibi etiketleme** kararı aldıysan, mesajı
yazmadan önce **dur ve şu ek kontrolü yap**. (§3'e girip zaten belirli bir kişiyi
etiketliyorsan bu bölüm çalışmaz — sadece "ekip etiketlenecek" durumları içindir.)

**Adım 1 — Aday havuzunu çıkar.** Thread'e katılmış herkesi listele. Buna
**ana mesajı (bug'ı) atan kişi de dahildir** — thread'de hiç yanıt olmasa bile
ana mesajın yazarı her zaman bir adaydır. Sonra bu listeyi §1b'deki **ilgili
ekibin üye listesiyle** kesiştir (PA kanalı → pa-product, CS kanalı → cs-product).
Ekip dışındakileri havuzdan çıkar.

> Aday havuzu = { ana mesajın yazarı } ∪ { thread'e yanıt yazanlar }, **kesişim**
> ilgili ekibin üye listesi.

**Adım 2 — Havuzun büyüklüğüne göre karar ver:**

| Havuzda kaç kişi var | Karar |
|---|---|
| **0 kişi** (ekipten kimse thread'e değmemiş) | **Ekibi** etiketle. |
| **1 kişi** | **O kişiyi** etiketle. Ek sahiplenme sinyali aramana gerek yok — bug'ı o raporlamışsa ya da ekipten tek konuşan oysa doğal muhatap odur. |
| **2+ kişi** | İçlerinden **en çok ilgilenen** kişiyi tespit et ve onu etiketle; **hiçbiri ilgilenmemişse ekibi** etiketle. |

**"İlgilenmiş" ne demek** (2+ kişi durumunda):
- Konuyu o yürütmüş: soru sormuş, repro istemiş, detay istemiş, "bakıyorum / bende /
  ben bakarım" demiş.
- Diğerleri ona yönlendirmiş: "<@X> bakabilir", "bu <@X>'in alanı",
  "sanırım <@X> ilgilenmişti".
- Son sözü / kararı o vermiş.

**Kararsızsan ekibi etiketle.** 2+ kişi varken şüphe hâlinde **her zaman ekip** —
yanlış kişiyi etiketlemek, ekibi etiketlemekten daha kötüdür. (Bu tie-break yalnızca
2+ kişilik havuz içindir; **tek kişilik havuzda tereddüt etme, o kişiyi etiketle**.)

**Adım 3 — Cümleyi kur.** §5'teki cümleyi aynen kullan, sadece `@etiket` yerine o
kişinin `<@U...>` ID'sini koy ve fiili **tekil**e çevir ("misiniz" → "misin"):
- "Bu bug için task açılmasına gerek varsa açabilir miyiz <@kişi-id>?"
- "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve hala fixlenmemiş gözüküyor. Kontrol edebilir misin <@kişi-id>?"
- "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve önceden fixlenmiş gözüküyor. Kontrol edebilir misin <@kişi-id>?"
- İstisna: seçilen kişi thread'de bir aksiyon sözü verdiyse (örn. "deneyeceğim",
"kontrol edeceğim") §5 cümlesi yerine o aksiyonu sor — örn. "Deneyebildin mi
<@kişi-id>?", "Kontrol edebildin mi <@kişi-id>?".

> Not: Bu kontrol sonucu kişiyi etiketlediysen, bu **§3 anlamında bir kişi
> hatırlatması** sayılır. Yani §6'da Reflex'in mesajından sonra thread'e hiç
> yanıt/emoji gelmezse bir sonraki run'da **ekibi** etiketleyerek hatırlatılır. Raporda (§7) "bugünkü aksiyon" alanına
> kişiyi **düz metin isim + ID ile** yaz — örn.
> `kişiye hatırlatma (Akif İnce, U0AG2C15XB7)`; `<@U...>` etiket formatı
> raporda KULLANILMAZ (§7 notu).

---

## 6. Backlog gözden geçirme (her run'ın BAŞINDA)

Yeni thread taramasına başlamadan **önce**, bir önceki run'ın backlog'unu işle:

1. **Backlog'u bul:** Rapor kanalı **#reflex** (`C0BFP48BMBK`) içinde,
   **yalnızca Reflex bot'unun attığı** (bot/app yazarlı — kullanıcı adına atılmış
   eski test raporlarını yok say) ve `🐛 Bug Watcher Raporu` başlığıyla başlayan
   mesajlar arasından **en yeni `ts` değerlisini** al. Bu mesajdaki "Backlog"
   listesi, bugünkü gözden geçirmenin girdisidir. Bot yazarlı rapor hiç yoksa
   (ilk çalıştırma) bu bölümü atla.
2. **Her backlog thread'ini tek tek yeniden değerlendir** — §2, §3, §4, §5 ve §5b
   adımlarını aynen yeni bir thread'miş gibi uygula ve şuna karar ver:
   *aksiyon almaya gerek var mı? backlog'da tutmaya gerek var mı?*

   - **Backlog'dan ÇIKAR:** Thread artık §2b'deki "zaten ilgilenilmiş"
     kontrollerinden herhangi birine takılıyorsa (✅/❌/✏️ emojisi, Asana linki,
     onaylayan yanıt vb.) → hiçbir şey yazma, thread'i backlog'dan çıkar ve
     raporda "Backlog'dan çıkanlar" altında sebebiyle birlikte listele.
   - **Hatırlatma sonrası kontrol:** Reflex'in thread'deki **son mesajından sonra**
     ne olduğuna bak (yanıt yazılmış mı, ana mesaja emoji konmuş mu):
     - Gelen yanıt/emoji §2b'ye takılıyorsa → zaten yukarıdaki kuralla
       backlog'dan çıkar.
     - Reflex'ten sonra hiç yanıt/emoji yoksa veya yanıt var ama
       konu hala kapanmamış ve yarım kalmışsa → **ilgilenilmemiş**: önceki
       hatırlatma kişiyeyse bu sefer **ekibi** etiketleyerek, ekibeyse **ekibe
       tekrar**, §6a'daki **kısa formatla** hatırlat ve thread'i backlog'da
       **tut**. (Kişiden ekibe yükseltme **§5b'yi ezer** — aynı kişiye ikinci
       kez hatırlatma yapma; kişi §3'ten mi §5b'den mi seçilmiş fark etmez.)
3. **Süre sınırı yok:** Bir thread, §2b kontrollerinden birine takılana kadar
   backlog'dan **asla düşmez** — günlerce aksiyon alınmazsa her run'da yeniden
   hatırlatılır. Raporda kaç gündür backlog'da olduğunu belirt (önceki rapordaki
   gün sayısını 1 artırarak).
4. **Çift işleme yapma:** Backlog'da gözden geçirdiğin bir thread son 24 saat
   taramasında tekrar karşına çıkarsa onu ikinci kez değerlendirme/yazma.

### 6a. Tekrar hatırlatma formatı (2. hatırlatmadan itibaren)

Reflex bir thread'e daha önce yazdıysa, sonraki her hatırlatma **kısa** olur:

> 🔄 <n>. hatırlatma: <kısa soru> @etiket

- **<n>** = thread'in bugünkü backlog gün sayısı: bir önceki rapordaki o thread
  satırının "backlog'da <n>. gün" değeri + 1 (§7).
- **Kısa soru:** tek cümle, run'dan run'a çeşitlendir — örn. "Kontrol edebildiniz
  mi?", "Bakabildiniz mi?", "Bu konuda ne durumdayız?", "Buraya bakan oldu mu?".
  Uzun süredir yanıt yoksa arada: "Buranın takip edilmesini istemiyorsanız emoji
  veya mesajla belirtir misiniz?"
- **Bağlamı TEKRARLAMA:** Asana linki, task adı, bug özeti yeniden yazılmaz —
  hepsi thread'in üstündeki ilk Reflex mesajında zaten var.
- **"X'dan yanıt gelmedi" YAZMA:** kişiden ekibe yükseltirken kişinin
  yanıtsızlığından bahsetme — thread'e bakan zaten görür. Sadece kısa soru +
  etiket.

---

## 7. Gün sonu raporu (#reflex)

- **Rapor kanalı:** **#reflex** — ID: `C0BFP48BMBK`.
- Her run'ın **sonunda** bu kanala **top-level** bir rapor mesajı at. Bu rapor aynı
  zamanda backlog'un **kalıcı kaydıdır**: ertesi günkü run, §6'yı bu mesajı okuyarak
  başlatır. Bu yüzden başlık ve format **sabittir**, değiştirme:

```
🐛 **Bug Watcher Raporu** — <GG.AA.YYYY>

📋 Backlog (yarınki run'da yeniden kontrol edilecek):
1. [<bug'ın tek satırlık özeti>](<thread permalink>) — [<kanal adı>](<kanal linki>) — 
   _Bugünkü aksiyon: <kişiye hatırlatma (<isim>, <U...>) | ekibe hatırlatma> — backlog'da <n>. gün_
2. ...

✅ Backlog'dan çıkanlar:
- [<bug'ın tek satırlık özeti>](<thread permalink>) — <çıkma sebebi: ✅/❌/✏️ emojisi geldi | Asana linki atıldı | onaylayan yanıt geldi | task açıldı>

📊 Özet: bugün <x> yeni thread incelendi, <y> yeni hatırlatma yapıldı, backlog'a <z> thread eklendi, <w> thread çıktı.
```

- **Raporda etiket kullanılmaz:** `<@U...>` / `<!subteam^...>` formatları rapora
  yazılmaz (#reflex'te bildirim düşürür). Kişi hatırlatması **düz metin
  isim + ID** ile kaydedilir — örn. `kişiye hatırlatma (Akif İnce, U0AG2C15XB7)`;
  §6 ertesi run bu ID'yi kullanır.
- **Backlog'a ne girer:** Bu run içinde hakkında **hatırlatma/etiketleme yaptığın
  her thread** — hem yeni taramadan gelenler hem §6'dan devam edenler. (§2a'daki
  "emin olamadım" soruları dahil: onlar da yanıt bekler.)
- Thread referansı olarak her zaman Slack **permalink**'ini kullan (ertesi gün
  thread'e bu linkten dönülecek).
- Backlog boşsa bunu da raporla: "📋 Backlog boş 🎉".
- **Dry-run** `true` iken bu rapor da dahil Slack'e hiçbir şey yazılmaz; rapor
  içeriğini yalnızca run çıktısında göster. (Dikkat: dry-run'da rapor atılmadığı
  için ertesi güne backlog devri olmaz.)