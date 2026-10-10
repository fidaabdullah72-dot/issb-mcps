# ISSB Green Academy — Secure Sheet System

Student ko ek link, phone number aur code milta hai. Sheet sirf **pehle phone** par khulti hai,
har page par us ka naam aur number watermark hota hai, aur copy/print band hai.
Admin panel se aap buyer add, device reset, block aur sheet upload karte hain.

```
secure-sheet/
├── site/                 ← yahi folder deploy hota hai (Vercel / Render)
│   ├── index.html        ← student page
│   ├── admin.html        ← admin panel
│   ├── config.js         ← Supabase URL + key yahan likhein
│   └── assets/
├── supabase/setup.sql    ← Supabase SQL Editor mein ek dafa chalana hai
└── render.yaml           ← Render ke liye (optional)
```

> MCQs ki file (`sheet-upload.html`) is repo mein **nahi** hai, aur honi bhi nahi chahiye.
> Woh sirf admin panel se upload hoti hai aur Supabase mein mehfooz rehti hai.

---

## 1. Supabase setup (5 minute)

1. [supabase.com](https://supabase.com) par naya project banayein (Region: **Singapore** ya **Mumbai**, Pakistan ke qareeb).
2. Bayen menu se **SQL Editor** → **New query**.
3. `supabase/setup.sql` ki poori file paste karein.
4. File ki **aakhri line** mein `APNA-PASSWORD-YAHAN` ki jagah apna admin password likhein (kam az kam 8 characters).
5. **Run** dabayein. Neeche `Admin password set ho gaya` aana chahiye.
6. **Project Settings → API Keys** se do cheezein copy karein:
   - **Project URL** (jaise `https://abcdxyz.supabase.co`)
   - **Publishable key** (`sb_publishable_...`) ya purani **anon public** key

> ⚠️ `secret` / `service_role` key kabhi bhi config.js mein na daalein, na kisi ko bhejein.
> Supabase ki **Data API** on rehni chahiye (by default on hoti hai).

## 2. config.js

`site/config.js` kholein aur likhein:

```js
SUPABASE_URL: "https://abcdxyz.supabase.co",
SUPABASE_KEY: "sb_publishable_xxxxxxxx",
WHATSAPP_NUMBER: "923001234567",   // help button ka number (92 se shuru)
```

## 3. GitHub par daalna

GitHub par naya repo banayein (Private behtar hai), phir is folder mein:

```bash
git init
git add .
git commit -m "Secure sheet system"
git branch -M main
git remote add origin https://github.com/USERNAME/issb-green-sheet.git
git push -u origin main
```

## 4. Deploy

**Vercel (recommended):**
1. vercel.com → **Add New → Project** → apna GitHub repo import karein
2. Framework Preset: **Other** · Build command khali chhor dein
   (Root Directory kuch bhi ho, chalega: repo ka `vercel.json` khud `site` folder dikhata hai)
3. **Deploy** → aap ko link mil jayega, jaise `https://issb-green-sheet.vercel.app`
4. Har `git push` par Vercel khud naya version deploy kar deta hai

**Render (doosra tareeqa):**
1. render.com → **New → Static Site** → repo select karein
2. Build Command: khali · **Publish Directory: `site`**
3. **Create Static Site**

## 5. Pehli dafa chalana

1. `https://APKA-LINK/admin.html` kholein → admin password se login
2. **Sheet upload** → `MCQs Sheet/sheet-upload.html` (ya apni Word .docx file) chunein → preview check → **Publish**
3. **Naya buyer** → naam + WhatsApp number → **Buyer add karein** → **WhatsApp par bhejein**

## Rozana ka kaam

| Kya hua | Kya karein |
|---|---|
| Student ne payment bheji | Admin → Naya buyer → WhatsApp par code bhejein |
| Student ka phone badal gaya / browser saaf ho gaya | Us buyer par **Device reset** |
| Kisi ne code share kiya (laal ⚠️ nishan) | **Naya code** ya **Block** |
| Sheet update karni hai | Nayi file upload → Publish (sab ko foran nayi sheet milegi) |
| Student ne 10 dafa ghalat code dala | 15 minute wait, ya **Unblock** daba dein |

## Ahem baatein

- **Screenshot 100% nahi rukta.** Mobile browser mein screenshot band karna mumkin nahi. Is liye har page par
  student ka **naam + number** watermark hai: leak hua to foran pata chal jayega kis ne kiya.
- Supabase ka free project agar **7 din tak bilkul use na ho** to pause ho jata hai. Dashboard se "Restore" kar dein.
- Admin password bhool jayein to SQL Editor mein yeh chalayein:
  `select public.gs_set_admin_password('NAYA-PASSWORD');`
