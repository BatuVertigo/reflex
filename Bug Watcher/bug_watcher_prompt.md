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
- **Deneme modu (dry-run):** `true`
  - `true` olduğunda ajan tüm analizi yapar ama Slack'e **hiçbir yanıt yazmaz** —
    sadece ne yapacağını raporlar. Test ederken bunu `true` yapabilirsin.
- **Araçlar:** Bu Routine, bağlı **Slack MCP** (mesaj/thread/reaction okuma, kullanıcı
  çözümleme, mesaj atma) ve **Asana MCP** (proje/task arama) connector'ları üzerinden
  çalışır. Asana'ya **hiçbir şey yazmaz/oluşturmaz** — Asana yalnızca okuma içindir.
- **Yanıt yeri:** Tüm yanıtlar ilgili bug mesajının **kendi thread'ine yanıt** olarak
  yazılır; bug kanallarına yeni (top-level) mesaj atılmaz.
  **Tek istisna:** gün sonu backlog raporu (§7), rapor kanalı **#reflex**'e top-level
  mesaj olarak atılır.
- **Dil:** Botun tüm Slack çıktıları **Türkçe**.

---

## 1. Slack kanalları

| Oyun | Kanal | ID | Workspace | Etiketlenecek ekip |
|---|---|---|---|---|
| Polygun Arena | #qa-polygunarena | `C0636S9C278` | vertigohq.slack.com | `@pa-product` |
| Polygun Arena | #community-feedback_polygun-arena | `C09S20F1V7E` | vertigohq.slack.com | `@pa-product` |

> İstediğiniz kanalları yeni satır olarak ekleyebilirsiniz.
> Ajan her kanalın son 24 saatteki ana mesajlarını ve thread yanıtlarını okur.

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

### 2a. Neyin gerçek bir bug olduğu
Bir mesajı; oyunda bozuk, beklenmedik ya da tasarlandığı gibi çalışmayan bir şeyi
bildirdiğinde aday bug olarak değerlendir. Örnekler: çökme (crash), donma, yanlış
değerler, eksik ödüller, UI hataları, ağ/desync sorunları, repro adımları, bir
hatanın ekran görüntüsü/videosu.

**Bug DEĞİLDİR (atla):** genel sorular, özellik istekleri, tasarım tartışmaları,
sürüm notları, sohbet, övgü, "nasıl yaparım…".

Bir şeyin gerçekten bug olup olmadığından **emin değilsen** ekibe sorabilirsin: "Bu mesaj bir bug içeriyor mu emin olamadım, kontrol eder misiniz? @etiket"

### 2b. Neyin "zaten ilgilenilmiş" sayıldığı (atla — YAZMA)
Aşağıdakilerden **herhangi biri** varsa bug'ı atla:
- ✅ onay emojisi = bug çözüldü ya da sorun olmadığına karar verildi.
- ❌ çarpı emojisi = bug ignore edilmeye karar verildi.
- ✏️ kalem emojisi = bug Asana'ya geçirilmiş.
- Ana mesajda veya thread yanıtlarında ilgili bug için Asana linki atılmış.
- Biri onaylayan bir yanıt yazmış: "düzeltildi", "task açıldı", "Asana taski açıldı", "hallettim", "bunu ignore edeceğiz", "bu bug değil", "bunu çözdük" gibi.

---

## 3. Birinden yanıt bekleniyor mu?

Thread'in son yanıtlarında belirli bir x kişisi:
1. "Bunu deneyeceğim."
2. "Bunu kontrol edeceğim."
3. "Bunun taskını açacağım."

diyerek kendisinin bir aksiyon alacağını söylemiş ve ondan yanıt bekleniyorsa, x kişisini etiketleyerek:
1. "Deneyebildin mi @x?"
2. "Kontrol edebildin mi @x?"
3. "Taskı açabildin mi @x?"

şeklinde kişi bazlı hatırlatma yap ve bu bug'ı geç.

> Güvenilir etiketleme için kişiyi adıyla değil **Slack üye ID'siyle** etiketle,
> formatı `<@U...>`. Kişi §1b tablosunda varsa oradaki ID'yi kullan; yoksa
> "Ben bakarım / deneyeceğim / taskını açacağım" diyen kişinin ID'sini **o an
> Slack'ten canlı çöz** (mesajın yazarından / kullanıcı arama ile).
---

## 4. Asana cross-check

- **Kural:** İlgili Slack kanalının oyunu (§1'deki listede var) Polygun Arena ise adı `PA` ile **başlayan** Asana projelerini, Critical Strike ise `CS` ile **başlayan** Asana projelerini dikkate al.
  (örn. `PA v1.370 - Main Menu Changes` veya `CS v14.8 - Gangster Paradise` gibi).
- **Asana'da task tipi:** Açılan her task bir **type** taşır — **Task** veya **Approval**.
  Bir bug Asana'ya girildiğinde **Approval** olarak açılır ve fix durumu bu approval'ın
  **state**'inden okunur: `rejected`, `changes requested` veya `approved`. Bir bug'ın benzerlerinin altında toplandığı **parent toplayıcı** ise normal **Task** tipindedir;
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
- **Arama yöntemi (önemli):** Cross-check yaparken **`search_objects`'e güvenme** —
  o yalnızca task **ismiyle** eşleşir ve gerçek eşleşmeleri kaçırır. Bunun yerine
  tam metin arayan **`search_tasks`** kullan (task ismi + açıklama + yorumları tarar).
  Anahtar kelimeleri **hem Türkçe hem İngilizce** dene (örn. `mor`/`purple`,
  `arka plan`/`background`, `pop-up`/`popup`), çünkü task içerikleri karışık dilde
  olabilir. Birden fazla sorgu varyasyonuyla ara; ilk boş sonuçta pes etme.
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

> `@etiket` yerine ilgili oyunun ekibini, §1'deki **usergroup ID** formatıyla etiketle:
> Channel → `<!channel>`,
> Polygun Arena → `<!subteam^S...>` (pa-product), Critical Strike → `<!subteam^S...>`
> (cs-product). Belirli bir kişiye dönüyorsan (§3) onun `<@U...>` ID'sini kullan.

### 5b. Ekibi etiketlemeden önceki son kontrol: acaba tek bir kişi mi?

§5'teki senaryolardan birine düşüp **ekibi etiketleme** kararı aldıysan, mesajı
yazmadan önce **dur ve şu ek kontrolü yap**. (§3'e girip zaten belirli bir kişiyi
etiketliyorsan bu bölüm çalışmaz — sadece "ekip etiketlenecek" durumları içindir.)

1. Thread'in **tüm yanıtlarını** yeniden oku.
2. Yanıt yazanları §1b'deki **ilgili ekibin üye listesiyle** eşleştir — yani sadece
   o kanalın ekibindeki kişileri dikkate al (PA kanalı → pa-product, CS kanalı →
   cs-product). Ekip dışından biri konuşmuşsa onu bu kontrolde sayma.
3. Şunu sor: **Bu bug'la ilgilenenin o ekipten tek bir kişi olduğu bariz mi?**

**Kişiyi etiketle** (ekip yerine), aşağıdakilerden en az biri **açıkça** varsa:
- Ekipten **bir kişi** thread'de daha çok konuşmuş ve bug'ı daha çok sahiplenmiş gibi
  görünüyor (soru sormuş, repro istemiş, detay istemiş, "bakıyorum/bende" demiş).
- Ekipten birden fazla kişi konuşmuş ama **biri açıkça sahiplenmiş**: konuyu o
  yürütmüş, diğerleri ona yönlendirmiş ("<@X> bakabilir", "bu <@X>'in alanı",
  "sanırım <@X> ilgilenmişti") ya da son sözü/kararı o vermiş.
- Bug açıkça o kişinin bilinen sorumluluk alanına giriyor ve thread'de bunu
  destekleyen bir iz var.

**Ekibi etiketle** (yani orijinal karar aynen kalsın), şunlardan biri varsa:
- Ekipten **hiç kimse** thread'de konuşmamış.
- Ekipten birden fazla kişi konuşmuş ve **hiçbiri belirgin şekilde sahiplenmemiş**.
- **Kararsızsan.** Şüphe varsa **her zaman ekibi etiketle** — yanlış kişiyi
  etiketlemek, ekibi etiketlemekten daha kötüdür.

Kişiyi etiketlemeye karar verirsen §5'teki cümleyi aynen kullan, sadece `@etiket`
yerine o kişinin `<@U...>` ID'sini koy. Örn:
- "Bu bug için task açılmasına gerek varsa açabilir miyiz <@U086CLB5JUX>?"
- "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve hala fixlenmemiş gözüküyor. Kontrol edebilir misin <@U086CLB5JUX>?"

> Not: Bu kontrol sonucu kişiyi etiketlediysen, bu **§3 anlamında bir kişi
> hatırlatması** sayılır. Yani §6'da o kişiden yanıt gelmezse bir sonraki run'da
> **ekibi** etiketleyerek hatırlatılır. Raporda (§7) "bugünkü aksiyon" alanına
> `kişiye hatırlatma <@U...>` yaz.

---

## 6. Backlog gözden geçirme (her run'ın BAŞINDA)

Yeni thread taramasına başlamadan **önce**, bir önceki run'ın backlog'unu işle:

1. **Backlog'u bul:** Rapor kanalı **#reflex** (`C0BFP48BMBK`) içinde Bug Watcher'ın
   attığı **en son** günlük raporu bul (rapor mesajları her zaman
   `🐛 Bug Watcher Raporu` başlığıyla başlar). Bu mesajdaki "Backlog" listesi,
   bugünkü gözden geçirmenin girdisidir. Rapor hiç yoksa (ilk çalıştırma) bu
   bölümü atla.
2. **Her backlog thread'ini tek tek yeniden değerlendir** — §2, §3, §4, §5 ve §5b
   adımlarını aynen yeni bir thread'miş gibi uygula ve şuna karar ver:
   *aksiyon almaya gerek var mı? backlog'da tutmaya gerek var mı?*

   - **Backlog'dan ÇIKAR:** Thread artık §2b'deki "zaten ilgilenilmiş"
     kontrollerinden herhangi birine takılıyorsa (✅/❌/✏️ emojisi, Asana linki,
     onaylayan yanıt vb.) → hiçbir şey yazma, thread'i backlog'dan çıkar ve
     raporda "Backlog'dan çıkanlar" altında sebebiyle birlikte listele.
   - **Kişi hatırlatması yanıtsız kaldıysa:** Önceki run'da belirli bir kişiye
     (`<@U...>`) hatırlatma yapılmış ama o kişi hâlâ yanıt vermemiş / aksiyon
     almamışsa → bu sefer **ekibi** etiketleyerek hatırlat (§5 üslubuyla, örn.
     "<@U...>'dan yanıt gelmedi, bu bug'ı sahiplenip task açılmasına gerek varsa
     açabilir miyiz @etiket?") ve thread'i backlog'da **tut**.
     Bu kural **§5b'yi ezer**: aynı kişiye ikinci kez hatırlatma yapma, doğrudan
     ekibe yükselt. (Kişi §3'ten mi yoksa §5b'den mi seçilmiş olursa olsun.)
   - **Ekip hatırlatması yanıtsız kaldıysa:** Önceki run'da ekibe hatırlatma
     yapılmış ve thread hâlâ §2 kontrollerinden geçiyorsa (yanıt/aksiyon yok) →
     ekibe **tekrar** hatırlat ve thread'i backlog'da **tutmaya devam et**;
     böylece ertesi run yine hatırlatabilir.
3. **Süre sınırı yok:** Bir thread, §2b kontrollerinden birine takılana kadar
   backlog'dan **asla düşmez** — günlerce aksiyon alınmazsa her run'da yeniden
   hatırlatılır. Raporda kaç gündür backlog'da olduğunu belirt (önceki rapordaki
   gün sayısını 1 artırarak).
4. **Çift işleme yapma:** Backlog'da gözden geçirdiğin bir thread son 24 saat
   taramasında tekrar karşına çıkarsa onu ikinci kez değerlendirme/yazma.

---

## 7. Gün sonu raporu (#reflex)

- **Rapor kanalı:** **#reflex** — ID: `C0BFP48BMBK`.
- Her run'ın **sonunda** bu kanala **top-level** bir rapor mesajı at. Bu rapor aynı
  zamanda backlog'un **kalıcı kaydıdır**: ertesi günkü run, §6'yı bu mesajı okuyarak
  başlatır. Bu yüzden başlık ve format **sabittir**, değiştirme:

```
🐛 Bug Watcher Backlog — <GG.AA.YYYY>

📋 Backlog (yarınki run'da yeniden kontrol edilecek):
1. <thread permalink> — <kanal adı> — <bug'ın tek satırlık özeti>
   Bugünkü aksiyon: <kişiye hatırlatma <@U...> | ekibe hatırlatma | ekibe tekrar hatırlatma (n. kez)> — backlog'da <n>. gün
2. ...

✅ Backlog'dan çıkanlar:
- <thread permalink> — <çıkma sebebi: ✅/❌/✏️ emojisi geldi | Asana linki atıldı | onaylayan yanıt geldi | task açıldı>

📊 Özet: bugün <x> yeni thread incelendi, <y> yeni hatırlatma yapıldı, backlog'a <z> thread eklendi, <w> thread çıktı.
```

- **Backlog'a ne girer:** Bu run içinde hakkında **hatırlatma/etiketleme yaptığın
  her thread** — hem yeni taramadan gelenler hem §6'dan devam edenler. (§2a'daki
  "bug mu emin olamadım" soruları dahil: onlar da yanıt bekler.)
- Thread referansı olarak her zaman Slack **permalink**'ini kullan (ertesi gün
  thread'e bu linkten dönülecek).
- Backlog boşsa bunu da raporla: "📋 Backlog boş 🎉".
- **Dry-run** `true` iken bu rapor da dahil Slack'e hiçbir şey yazılmaz; rapor
  içeriğini yalnızca run çıktısında göster. (Dikkat: dry-run'da rapor atılmadığı
  için ertesi güne backlog devri olmaz.)