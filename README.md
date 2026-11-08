# Training Week

An offline iPhone app (a PWA) for planning and tracking weekly training around injuries.

- A week view in the style of Google Calendar that runs **Sunday → Saturday**, with Friday and Saturday shaded as the weekend.
- Tap an empty slot, or **+**, to book a session. Tap a session to edit it.
- Tag each session with the **body area or injury** it affects. You can add your own areas.
- Pick a session from grouped presets — **Training**, **Sports** (football, padel tennis, tennis, squash…), **Tendon rehab** (functional training, isometrics, eccentric loading, heavy slow resistance…) and **Recovery** (ice pack, physio at the clinic, massage, stretching…) — or type your own.
- Mark each session **Planned / Done / Skipped** and add a reason when you skip one. When it's **Done**, record **pain after the session (1–10)**; it shows as a coloured badge on the calendar and the footer shows the week's average and max. Planned sessions in the past get an amber outline so you notice them.
- The footer shows the week's totals and which areas were hit most.
- Swipe left or right to change weeks. **⋯** opens three options: copy last week's plan, export a backup, or import a backup.
- Data is stored only on the phone (`localStorage`). There is no account, no server and no internet needed after the first load.

## Install on iPhone

The app has to be served over HTTPS once. After that it runs fully offline.

1. Host it on GitHub Pages: on GitHub, open **Settings → Pages**, choose **Deploy from a branch**, pick the branch and `/ (root)`, then save.
2. On the iPhone, open the Pages URL in **Safari**, tap **Share → Add to Home Screen**, then **Add**.
3. Launch it from the home screen. It now works in airplane mode.

**Back up regularly** (⋯ → Export). If you delete the home-screen app, its data is deleted with it.

## Updating

After changing any file, bump `VERSION` in `sw.js`. Phones then pick up the new version the next time they open the app while online.
