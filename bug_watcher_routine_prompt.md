# Bug Watcher — Config

> Her sabah 09:00'da çalışan "Bug Watcher Routine"inin tek doğruluk kaynağı bu dosyadır.
> Bu dosyayı düzenleyerek Routine'i istediğiniz şekilde değiştirmiş olursunuz.

---

## 0. Çalıştırma ayarları

- **Zamanlama:** her gün saat **09:00** (Europe/Istanbul) — **hafta sonları dahil**.
- **Geriye bakış:** Kanala **son 24 saatte** atılmış ana mesajlara (top-level mesaj) bak; her birinin thread yanıtlarını da oku.
- **Deneme modu (dry-run):** `true`
  - `true` olduğunda ajan tüm analizi yapar ama Slack'e **hiçbir yanıt yazmaz** —
    sadece ne yapacağını raporlar. Test ederken bunu `true` yapabilirsin.
- **Araçlar:** Bu Routine, bağlı **Slack MCP** (mesaj/thread/reaction okuma, kullanıcı
  çözümleme, mesaj atma) ve **Asana MCP** (proje/task arama) connector'ları üzerinden
  çalışır. Asana'ya **hiçbir şey yazmaz/oluşturmaz** — Asana yalnızca okuma içindir.
- **Yanıt yeri:** Tüm yanıtlar ilgili bug mesajının **kendi thread'ine yanıt** olarak
  yazılır; kanala yeni (top-level) mesaj atılmaz.
- **Dil:** Botun tüm Slack çıktıları **Türkçe**.

---

## 1. Slack kanalları

| Oyun | Kanal | ID | Workspace | Etiketlenecek ekip |
|---|---|---|---|---|
| Polygun Arena | #batuhan-test | `C0B9QV6PPDG` | vertigohq.slack.com | `<!channel>` |

> İstediğiniz kanalları yeni satır olarak ekleyebilirsiniz.
> Ajan her kanalın son 24 saatteki ana mesajlarını ve thread yanıtlarını okur.

---

## 2. Kurallar

### 2a. Neyin gerçek bir bug olduğu
Bir mesajı; oyunda bozuk, beklenmedik ya da tasarlandığı gibi çalışmayan bir şeyi
bildirdiğinde aday bug olarak değerlendir. Örnekler: çökme (crash), donma, yanlış
değerler, eksik ödüller, UI hataları, ağ/desync sorunları, repro adımları, bir
hatanın ekran görüntüsü/videosu.

**Bug DEĞİLDİR (atla):** genel sorular, özellik istekleri, tasarım tartışmaları,
sürüm notları, sohbet, övgü, "nasıl yaparım…".

Bir şeyin gerçekten bug olup olmadığından **emin değilsen** ekibe sorabilirsin: "@pa-product Bu mesaj bir bug içeriyor mu emin olamadım, kontrol eder misiniz?"

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
> formatı `<@U...>`. "Ben bakarım / deneyeceğim / taskını açacağım" diyen kişinin
> ID'sini **o an Slack'ten canlı çöz** (mesajın yazarından / kullanıcı arama ile);
> ID'leri prompta hardcode etme. (Örn. Batuhan Büber = `<@U0AQYJRJCSV>`.)
---

## 4. Asana cross-check

- **Kural:** İlgili Slack kanalının oyunu (§1'deki listede var) Polygun Arena ise adı `PA` ile **başlayan** Asana projelerini, Critical Strike ise `CS` ile **başlayan** Asana projelerini dikkate al.
  (örn. `PA v1.370 - Main Menu Changes` veya `CS v14.8 - Gangster Paradise` gibi).
- **Asana'da task tipi:** Açılan her task bir **type** taşır — **Task** veya **Approval**.
  Bir bug Asana'ya girildiğinde **Approval** olarak açılır ve fix durumu bu approval'ın
  **state**'inden okunur: `approved` (fixlenmiş/onaylanmış) veya `rejected` (kapatılmış/
  reddedilmiş). Bir bug'ın benzerlerinin altında toplandığı **parent toplayıcı** ise
  normal **Task** tipindedir; bunu task'ın **ismi** ile bizim bug'ın içeriğini
  karşılaştırarak (anlamsal benzerlik) tespit et.
- **Eşleştirme mantığı:**
  1. Bu bug halihazırda Asana'ya girilmiş (**Approval** type) ve state'i `rejected` yani henüz fixlenmemiş → §5.1.
  2. Bu bug daha önce girilmiş (**Approval** type) ve state'i `approved` yani fixlenmiş → §5.2.
  3. Bu buga benzer bugların toplandığı bir **parent toplayıcı Task** var mı (isim +
     içerik eşleşmesi) → §5.3.
- Buradaki cross-check'ten bazı Asana taskları elde edilirse onlardan en son yanıtı oluştururken bahset.

---

## 5. Senaryolar

### Ne emoji ne yanıt hiçbir aksiyon verilmemiş:
- Asana cross-check'ten sonuç dönmedi:
  - "Bu bug için task açılmasına gerek varsa açabilir miyiz @etiket?"
- Asana cross-check'ten sonuç döndü:
  1. "Asana'da bulduğum [şu task](link) bu bug'a benziyor ve hala fixlenmemiş gözüküyor. Kontrol edebilir misiniz @etiket?"
  2. "Bu bug daha önce Asana'ya [girilmiş](link) ve fixlenmiş gözüküyor. Kontrol edebilir misiniz @etiket?"
  3. "Bu tarz buglarım Asana'da [şu task](link) altında toplandığını gördüm. Belki subtask ekleyebiliriz veya yeni task açabiliriz @etiket"

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