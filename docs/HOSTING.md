# Host lennytype on GitHub Pages

GitHub Pages serves static HTML, CSS, JavaScript, and fonts. It cannot run the multiplayer API or database. This setup serves the frontend from your GitHub repository and runs the existing API in your own Cloudflare account. Both parts work independently of ChatGPT Sites.

## 1. Deploy the multiplayer API

Create a Cloudflare account if you do not already have one. From this checkout:

```sh
npx wrangler@4 login
npx wrangler@4 d1 create lennytype
```

Copy the returned database ID, then:

```sh
cp wrangler.example.json wrangler.json
```

Edit `wrangler.json`:

- Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with your database ID.
- The allowed GitHub Pages **origin** is already set to `https://jetthiggins.github.io`, without the repository path. The repository path `/lennytype/` must not be included in this value.
- For a custom domain, use that origin instead. Multiple allowed origins can be separated by commas.

Then run:

```sh
npx wrangler@4 d1 migrations apply lennytype --remote --config wrangler.json
npx wrangler@4 deploy --config wrangler.json
```

Wrangler prints your Worker URL, such as `https://lennytype-api.YOUR_SUBDOMAIN.workers.dev`. Keep that URL for the next step. Use only the origin, without `/api` or a trailing slash.

`wrangler.json` is ignored by Git so account-specific deployment settings stay local. The database and room state are new; no data or credentials from the previous ChatGPT Site are needed.

Cloudflare references: [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/), [Worker configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## 2. Push the repository to GitHub

The repository is [JettHiggins/lennytype](https://github.com/JettHiggins/lennytype). For a fresh checkout, or to repeat the initial push:

```sh
git add .
git commit -m "Rename to lennytype and prepare GitHub Pages"
git branch -M main
git remote add origin git@github.com:JettHiggins/lennytype.git
git push -u origin main
```

If an `origin` remote already exists, check `git remote -v` first and use `git remote set-url origin ...` only if that is the remote you intend to replace. Authenticate through your existing GitHub Git credentials or SSH; never put a token into the repository.

## 3. Enable Pages

In the GitHub repository:

1. Open **Settings → Secrets and variables → Actions → Variables**.
2. Add `LENNYTYPE_API_URL` with the Worker origin from step 1. This URL is public configuration, so use a repository variable, not a secret.
3. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. Open **Actions → Deploy lennytype to GitHub Pages → Run workflow**. Future pushes to `main` deploy automatically.
5. Open the URL shown by the deployment, usually `https://jetthiggins.github.io/lennytype/`.

The workflow deliberately fails if `LENNYTYPE_API_URL` is missing, rather than publishing a multiplayer UI with nowhere to connect.

Reference: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 4. Verify

Open the Pages URL in two browsers. Create a room, join it from the room list, and start a race. Verify matching words and colored cursors. Leave from either browser during the race. The other player should remain in the room, with the host role transferring if needed.

To check the static build locally against the local API:

```sh
LENNYTYPE_API_URL=http://localhost:3000 npm run build
```

Serve `dist/pages` with a static server. Set the API's `ALLOWED_ORIGINS` environment variable to that server's origin, for example `http://localhost:4173`, before starting `npm run dev`.

## Remove the previous ChatGPT Site

The previous Site is `multitype-race` at `https://multitype-race.jetthigg.chatgpt.site`. Public access has been removed; it remains accessible to its owner and any applicable workspace admins. This is an access restriction, not permanent deletion or a promise that hosting resources have been destroyed.

To permanently remove it:

1. Open **Sites** in the ChatGPT sidebar.
2. Find **multitype** / **multitype-race**.
3. Select **Delete site**.
4. Enter the slug `multitype-race` when prompted, then select **Permanently delete**.

Deletion is permanent. Your local project and new GitHub repository are independent of that Site. The available Sites connector does not expose a delete operation, so this last action must be done in the Sites UI.

Reference: [OpenAI's take-down instructions](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites).
