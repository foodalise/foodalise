# The foodalise.com website

A small website: a home page plus the privacy policy, Terms of Use and reviews
policy, at foodalise.com/privacy, /terms and /reviews-policy. Apple asks for the
privacy policy link before people outside your team can test the app.

The pages are made from the same text as the app (lib/legal.ts), so they always
match. After changing that text, run `node scripts/build-website.mjs` and commit
the `website` folder too.

## Putting it online (once, free, on Cloudflare)

1. Sign in at https://dash.cloudflare.com, open **Workers & Pages**, click
   **Create**, choose the **Pages** tab, then **Connect to Git**.
2. Connect your GitHub account and pick the **foodalise/foodalise** repository.
3. On the set-up screen:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `exit 0`
   - Build output directory: leave it empty
   - Open **Root directory (advanced)** and type `website`
4. Click **Save and Deploy**. After a minute it gives you an address ending in
   `.pages.dev`; open it to check the site.
5. In the project, open **Custom domains**, click **Set up a custom domain**,
   type `foodalise.com` and follow the steps. Do the same for `www.foodalise.com`.
   As the web address is with Cloudflare already, it sets itself up.

From then on the website updates by itself whenever a change is merged on GitHub.
