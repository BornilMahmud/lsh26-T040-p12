# Firebase setup — required before data will save

Project: **`project-12-84b49`**

If you see an error like **"Firestore blocked this write (permission-denied)"**, it means
the steps below have not been completed. The app code is correct; Firebase is refusing
the write because its security rules have not been published.

---

## Step 1 — Create the Firestore database (once)

1. Open <https://console.firebase.google.com/project/project-12-84b49/firestore>
2. If you see a **"Create database"** button, click it.
   - Mode: pick **Start in production mode** (we publish our own rules in Step 2)
   - Location: `asia-south1` (Mumbai) is closest to Bangladesh
3. Wait for provisioning to finish.

You do **not** need to create any collections or fields by hand. Firestore is
schemaless — the app creates `users/{uid}/expenses`, `pockets`, `receipts` and
`settings/profile` automatically on first write.

---

## Step 2 — Publish the Firestore rules (this is what fixes the error)

Go to **Firestore Database → Rules** tab, delete everything in the editor, paste the
block below, then press **Publish**.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    function validExpense() {
      let d = request.resource.data;
      return d.amount is number
        && d.amount >= 0
        && d.date is string
        && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.category is string
        && d.userId == request.auth.uid;
    }

    function validPocket() {
      let d = request.resource.data;
      return d.target is number
        && d.target >= 0
        && d.monthlyContribution is number
        && d.monthlyContribution >= 0
        && d.name is string
        && d.name.size() > 0
        && d.userId == request.auth.uid;
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId);

      match /expenses/{expenseId} {
        allow read, delete: if isOwner(userId);
        allow create, update: if isOwner(userId) && validExpense();
      }

      match /pockets/{pocketId} {
        allow read, delete: if isOwner(userId);
        allow create, update: if isOwner(userId) && validPocket();
      }

      match /receipts/{receiptId} {
        allow read, write: if isOwner(userId);
      }

      match /settings/{docId} {
        allow read, write: if isOwner(userId);
      }

      match /{document=**} {
        allow read, write: if isOwner(userId);
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This is the same content as `firestore.rules` in the repo.

---

## Step 3 — Publish the Storage rules (needed for receipt images)

Go to **Storage → Rules**, paste the block below, press **Publish**.
If Storage has never been used, click **Get started** first.

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /receipts/{userId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Same content as `storage.rules` in the repo.

---

## Step 4 — Enable Google Sign-In and authorize the domain

1. **Authentication → Sign-in method → Google → Enable → Save**
2. **Authentication → Settings → Authorized domains → Add domain**

   Add the host you are opening the app from, without `https://` and without a path:

   ```
   3000-i835z2b5myerljj1auyuk-3844e1b6.sandbox.gensparksite.com
   ```

   `localhost` is authorized by default. Add your production domain too when you deploy.

If this step is missed you get `auth/unauthorized-domain` on the sign-in popup
(a different error from the permission-denied one).

---

## Step 5 — Reload and retry

Hard-reload the app (Ctrl+Shift+R) and complete onboarding again. On success you will
see the document appear under **Firestore Database → Data** at:

```
users / <your-uid> / settings / profile
```

---

## Optional — deploy rules from the command line instead of the console

The repo has a `firebase.json`, so if you prefer the CLI:

```bash
cd webapp
npx firebase-tools login
npx firebase-tools deploy \
  --only firestore:rules,firestore:indexes,storage \
  --project project-12-84b49
```

This also creates the two composite indexes in `firestore.indexes.json`.

---

## Troubleshooting by error code

The app now prints the real Firebase code. Open DevTools (F12) → Console and look for
`[ledger] failed to save your settings { code: ... }`.

| Code | Meaning | Fix |
|---|---|---|
| `permission-denied` | Rules not published, or still locked-mode | Step 2 |
| `failed-precondition` | Firestore database not created, or index missing | Step 1 / CLI deploy |
| `not-found` | Wrong `projectId`, or no database | Check `.env`, Step 1 |
| `unavailable` | Network / offline | Check connection |
| `unauthenticated` | Session expired | Sign out, sign in again |
| `auth/unauthorized-domain` | Host not whitelisted | Step 4 |

Until Firebase is configured, **Demo mode** works fully offline (localStorage) and
exercises exactly the same analytics engines.
