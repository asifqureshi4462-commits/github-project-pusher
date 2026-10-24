# GitForge Pusher (Android APK)

Koi bhi **ZIP** ya files chuno. App ZIP ko **khud extract** karti hai aur har file ko **alag alag** GitHub par upload karti hai (folder structure ke saath), phir sab files ek hi commit mein jama hoti hain. Koi server ya PHP nahi chahiye, sab kuch phone ke andar chalta hai.

## Logo / Icon kaha lagana hai

Aapko sirf **2 files** replace karni hain (dono ka naam bilkul wahi rakho):

| # | File ka path | Kahan dikhega | Size |
|---|---|---|---|
| 1 | `resources/icon.png` | **APK ka launcher icon** (phone ki home screen / app drawer) | 1024 x 1024 PNG |
| 2 | `www/img/logo.png` | **App ke andar** upar header mein aur browser favicon | 512 x 512 PNG |

Tips:
- Dono mein ek hi logo laga sakte ho (bas size alag).
- `resources/icon.png` ka **background poora bhara hua** rakho (transparent nahi) aur logo ko **beech ke 60% hisse** mein rakho, warna Android ka gol/squircle shape kinare kaat dega.
- Baaki sab icons (mdpi se xxxhdpi, round, adaptive) workflow khud `scripts/make-icons.sh` se bana deta hai. Aapko kuch aur nahi karna.

## App ka naam / package badalna

`capacitor.config.json` kholo:
- `appName` = phone par dikhne wala naam
- `appId` = unique package id (jaise `com.asif.gitforge`)

## APK kaise banegi (sab GitHub par, laptop ki zaroorat nahi)

1. Is poore project ko apne GitHub repo mein upload karo. **Zaroori:** hidden folder `.github/workflows/build-apk.yml` bhi upload hona chahiye, warna APK nahi banegi. (Phone ke file manager mein `.github` hidden hota hai, "Show hidden files" on karo.)
2. Repo mein **Actions** tab kholo. Workflow **Build Android APK** apne aap chalega (`main` branch par push hote hi). Na chale to *Run workflow* dabao.
3. Lagbhag 5-8 minute baad dono jagah APK milegi:
   - Repo ke **Releases** section mein `GitForge-Pusher.apk`
   - Ya Actions run ke neeche **Artifacts** mein `GitForge-Pusher-APK`
4. APK download karke phone mein install karo (Settings mein "Install unknown apps" allow karna padega).

Icon ya logo badalna ho to file replace karke push karo, nayi APK khud ban jayegi.

## Use kaise karein

1. GitHub token banao: GitHub, Settings, Developer settings, Personal access tokens.
   - Classic token: **repo** permission
   - Fine-grained token: **Contents: Read and write** (us repo ke liye)
2. App kholo, token paste karo, **Connect** dabao.
3. Repo aur branch chuno (ya naya repo / nayi branch banao).
4. **ZIP / Files chuno** dabao. ZIP chunte hi app use extract karke saari files ki list dikha degi.
5. Jo file nahi chahiye uska tick hatao. `.env`, keys, tokens wali files automatically unselect ho jati hain.
6. **GitHub par Push karo** dabao.

## Kya khaas hai

- ZIP ki pehchan **file ke naam se nahi, andar ke content (PK header) se** hoti hai, isliye naam ya type kuch bhi ho, ZIP hamesha extract hogi.
- Extract engine app ke andar hi hai (internet ya CDN par depend nahi).
- Ek hi bar mein ZIP + alag files dono chun sakte ho. Same path ki file ho to nayi file purani ko replace karti hai.
- ZIP ka bahari root folder hatane ka option (e.g. `project-main/`).
- GitHub par jo files pehle se bilkul same hain unhe skip kar deta hai, aur khali repo par bhi kaam karta hai.
- Token sirf GitHub ko jata hai. "yaad rakho" tick karoge tabhi phone par save hoga.
