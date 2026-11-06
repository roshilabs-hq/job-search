<div dir="rtl">

# /add-company: מוסיפים חברה לחיפוש

המשתמש רוצה שהסוכן יבדוק גם חברה שלא ברשימה. המטרה: שורה אחת ב-`my-companies.json`, אחרי בדיקה שהיא באמת מחזירה משרות. **לא משנים קוד.**

1. **בודקים שהיא לא כבר ברשימה:** מחפשים את השם (בעברית ובאנגלית) ב-`companies.json` וב-`my-companies.json`.
   - **החברה ברשימה, אבל התחום שלה לא נבחר:** מציעים להוסיף את התחום (`sectors` ב-`settings.json`), או להעתיק רק אותה ל-`my-companies.json`.
2. **מוצאים את דף הדרושים של החברה** (חיפוש ברשת: "<שם החברה> careers" או "<שם החברה> דרושים") ובודקים לאן מובילים הקישורים של המשרות.

   | הקישור נראה כך | platform | מה לשים בהגדרה |
   |---|---|---|
   | `boards.greenhouse.io/<x>` או `job-boards.greenhouse.io/<x>` (או `gh_jid=` בקישור) | greenhouse | `"board": "<x>"`, ו-`"eu": true` אם הכתובת כוללת `.eu.` |
   | `jobs.lever.co/<x>` | lever | `"board": "<x>"`, ו-`"eu": true` אם הכתובת היא `jobs.eu.lever.co` |
   | `jobs.ashbyhq.com/<x>` | ashby | `"board": "<x>"` |
   | `jobs.smartrecruiters.com/<x>` | smartrecruiters | `"board": "<x>"` |
   | `<x>.wd<N>.myworkdayjobs.com/<site>` | workday | `"host": "<x>.wd<N>.myworkdayjobs.com", "tenant": "<x>", "site": "<site>"` |
   | `career.adamtotal.co.il/?token=<t>` | sites | `"site": "adamtotal", "token": "<t>"` |

3. **בונים הגדרה:** `{"id": "<מזהה קצר באנגלית>", "name": "<שם>", "sector": "<תחום>", "platform": "...", ...}`, ובודקים אותה:
   `node scripts/verify-companies.mjs --one '<ההגדרה כ-JSON>'`
   - **עבר** (`"ok":true`): מוסיפים את ההגדרה למערך ב-`my-companies.json` (אם הקובץ לא קיים, יוצרים אותו עם `[...]`). אומרים למשתמש: "נוסף. מהריצה הבאה הסוכן בודק גם את <שם>. כרגע יש שם X משרות בישראל."
   - **לא עבר, או שהחברה לא על אחת המערכות בטבלה:** זו חברה שצריכה קוד מיוחד. אל תכתוב קוד בעצמך. מציעים לשלוח בקשה, והחברה תיכנס לכל המשתמשים בעדכון הבא:
     - **עם חשבון GitHub:** https://github.com/roshilabs-hq/job-search/issues/new?template=add-company.yml
     - **בלי חשבון:** וואטסאפ https://wa.me/972553048489, עם שם החברה וקישור לדף הדרושים שלה.

**לעולם לא** מוסיפים מקור שדורש להתחבר עם שם משתמש, לעקוף חסימה או בדיקת "אני לא רובוט", או להתחזות לדפדפן. דרושים (drushim.co.il) לא נכנס, כי התקנון שלו אוסר איסוף אוטומטי.

</div>
