# Dashboard project

React + Vite front end, a small Node API, and MySQL (or MariaDB) for the data.

## One-time setup

1. **Install a database** (MariaDB is a drop-in for MySQL):
   `sudo apt install mariadb-server && sudo systemctl enable --now mariadb`
2. **Create the database and user:**
   ```
   sudo mysql -e "CREATE DATABASE dashboard CHARACTER SET utf8mb4;
                  CREATE USER 'dashboard'@'localhost' IDENTIFIED BY 'choose-a-password';
                  GRANT ALL PRIVILEGES ON dashboard.* TO 'dashboard'@'localhost';"
   ```
3. **Install the project:** `npm install`
4. **Settings:** `cp .env.example .env`, then put the same password in `DB_PASSWORD`.
5. **PDF scanning (optional, PDFs only):** install Ollama, then `ollama pull glm-ocr`.
   CSV, Excel and JSON uploads work without it.

## Every time

Two terminals, both in this folder:

```
npm run server     # the API (creates the tables on first start)
npm run dev        # the website, usually http://localhost:5173
```

## Where things are

- `server/`  the API: `app.js` (rules and permissions), `repo.js` (all SQL), `format.js` (turns text into numbers/dates for charts), `schema.sql` (the tables)
- `src/pages/`  the pages (home, FAQ, contact, login, sign-up, dashboard)
- `src/components/`  navigation, Documents screen, document viewer, chart, users panel
- `src/lib/`  file reading (PDF, CSV, Excel, JSON), the OCR client, chart maths, API helper
- `.env.example`  every setting, with comments
