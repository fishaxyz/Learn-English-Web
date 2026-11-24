# Turning on "Continue with Google"

The dashboard shows a **Continue with Google** button only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set. It costs nothing: Google sign-in is free.

The same rules apply as for email links:
- The Google account's email address must be **invited** (`pnpm docker:invite --email … --role …`).
- Google must have **verified** that address.

## 1. Create the credentials (in Google Cloud, once)

1. Go to <https://console.cloud.google.com/> and create a project, for example "English Skills".
2. Open **APIs & Services → OAuth consent screen**:
   - **User type:** External.
   - **App name:** your site's name.
   - **Support email:** your address.
   - **Scopes:** add `openid`, `email` and `profile`. Nothing else is needed.
   - **Test users:** while the app is in "Testing", add each person who will sign in.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application.
   - **Authorized redirect URIs:**
     - local: `http://localhost:3401/api/auth/callback/google`
     - live: `https://<your dashboard address>/api/auth/callback/google`
4. Google shows a **Client ID** and a **Client secret**.

## 2. Put them in `.env` (never in the code, never committed)

```dotenv
AUTH_GOOGLE_ID=<Client ID>
AUTH_GOOGLE_SECRET=<Client secret>
```

Then restart: `pnpm docker:up`.

On a server, put them in the host's secret settings instead of a file.

## 3. Check

Open <http://localhost:3401/sign-in>. The button appears above the email form.

| You sign in with | Result |
|---|---|
| An invited Google account | You land on the lessons list |
| An account that isn't invited | "That Google account isn't invited" |

## Notes

- **One account per person.** A Google sign-in links to the invited user with the same email, so someone can use Google one day and an email link the next.
- **Choosing an account.** Google always asks which account to use, so a shared computer doesn't sign in the wrong person.
- **Data kept.** Google's tokens are stored in the `accounts` table, as Auth.js does. The dashboard only asks for name, email and picture, and never calls other Google services.
- **Going public.** While the consent screen is in "Testing", only the listed test users can sign in. Publish the app (no Google review is needed for these basic scopes) once real editors need it.
