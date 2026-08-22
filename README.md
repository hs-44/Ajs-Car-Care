# AJS Car Care — Full-Stack Booking System

A complete dynamic version of your site: user accounts, real slot locking,
an admin dashboard, Razorpay payments, and downloadable PDF receipts.

## What's inside

```
backend/
  server.js              → app entry point
  db.js                  → SQLite database + schema + auto-seeding
  middleware/auth.js      → login/session verification (JWT)
  routes/
    auth.js               → signup / login
    bookings.js            → slot availability + create booking (double-booking proof)
    services.js            → service list + admin price management
    payments.js             → Razorpay order + payment verification + receipts
    admin.js                → admin dashboard data (bookings, stats)
  utils/receipt.js        → PDF receipt generator
  public/                 → the actual website (served by the same server)
    index.html             → your main site, now wired to the real API
    login.html / signup.html
    my-bookings.html        → customer's own booking history
    admin/login.html
    admin/dashboard.html    → admin view: all bookings, stats, status control
  .env.example            → copy to .env and fill in real values
```

## 1. Install & run locally

You need [Node.js](https://nodejs.org) (v18+) installed.

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set:
- `JWT_SECRET` — any long random string
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your admin login (auto-created on first run)
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from your [Razorpay dashboard](https://dashboard.razorpay.com) → Settings → API Keys (use **Test Mode** keys first)

Then start the server:

```bash
node server.js
```

Visit **http://localhost:4000** — that's your live site.

The database (`data/ajscarcare.db`) is created automatically on first run,
along with the 8 default services and one admin account (printed in the
terminal on first start — change that password immediately).

## 2. How the flow works

- **Customer**: Signs up / logs in → clicks "Book a Slot" → picks service,
  date, and a real available time slot → enters car details → pays via
  Razorpay checkout → booking is marked `confirmed` only after the server
  verifies the payment signature → can download a PDF receipt and see all
  bookings on `/my-bookings.html`.
- **Double-booking protection**: the database itself rejects two bookings
  for the same date+time slot (a `UNIQUE` constraint) — not just JavaScript,
  so it holds even under concurrent requests.
- **Admin**: Logs in at `/admin/login.html` → sees total bookings, today's
  confirmed count, revenue collected, and every booking with a dropdown to
  mark it `completed` / `cancelled` / etc.
- **Receipts**: Only generated for `confirmed`/`completed` bookings, pulling
  real payment + customer + service data into a PDF.

## 3. Razorpay setup (required for payments to work)

1. Create a free account at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys → Generate Test Key** — copy the Key ID and Key Secret into `.env`
3. Test payments use Razorpay's [test card numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/) — no real money moves
4. When ready to go live: complete Razorpay's KYC, switch to **Live Mode** keys, update `.env`

## 4. Deploying so it's live on the internet

Right now this only runs on your computer (`localhost`). To make it public:

- **Easiest**: deploy to [Render](https://render.com) or [Railway](https://railway.app) — connect your GitHub repo, set the same environment variables from `.env`, and it's live with a public URL. Both have free tiers.
- Point your domain (e.g. `ajscarcare.in`) to that URL once deployed.
- **Note on SQLite**: it works great for a single small business, but on
  most cloud hosts the disk resets on redeploy. If you outgrow SQLite later,
  swapping to a hosted Postgres database (Render/Railway both offer one) is
  a small change — ask and I can do that migration for you.

## 5. Admin password

The first admin account is created automatically from `.env`. To add more
staff logins or change the password, the simplest path right now is running
a small script — ask and I'll add a proper "change password" screen or a
second admin account for you.

## 6. What's intentionally NOT included yet (tell me if you want these next)

- Email/SMS notifications when a booking is confirmed (needs an email
  provider like SendGrid or an SMS provider like Twilio/MSG91)
- Forgot-password flow
- Multiple staff accounts / roles beyond a single admin
- Editing service prices from the admin UI (the API route exists — `PUT /api/services/:id` — just needs a small screen)

## 7. Docker

Build and run the app as a container (build context is the `backend/` folder):

```bash
cd backend
docker build -t ajs-car-care .
docker run -d --name ajs-car-care \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  ajs-car-care
```

The `-v .../data:/app/data` volume mount is important — without it, your
SQLite database (bookings, users) is lost every time the container is
recreated.

## 8. CI/CD with Jenkins

The included `Jenkinsfile` (repo root) runs: checkout → SonarQube scan →
quality gate → `npm install` → Trivy filesystem scan → Docker build & push
→ Trivy image scan → deploy to your EC2 instance over SSH by pulling the
new image and restarting the container.

Before running it, in Jenkins set up:

- **Tools** (Manage Jenkins → Tools): a NodeJS install named `node20`, a JDK named `jdk`, and the SonarQube Scanner tool.
- **Credentials** (Manage Jenkins → Credentials):
  - `github-token` — GitHub personal access token, for checkout
  - `docker` — Docker Hub username/password
  - `Sonar-token` — SonarQube auth token
  - `ec2-ssh-key` — the EC2 `.pem` key, added as "SSH Username with private key" (username `ubuntu`)
- **System config**: a SonarQube server entry named `SonarQube` pointing at your SonarQube instance.
- **On the EC2 server itself** (one-time setup, before the first pipeline run):
  ```bash
  sudo apt install -y docker.io
  sudo usermod -aG docker ubuntu   # log out/in after this
  mkdir -p ~/ajs-car-care/data
  nano ~/ajs-car-care/.env         # paste your real JWT_SECRET, Razorpay keys, etc.
  ```
  The pipeline never uploads your `.env` — it expects one to already exist
  on the server at `/home/ubuntu/ajs-car-care/.env`, keeping real secrets
  out of Jenkins and GitHub entirely.
- **Also update the placeholders** in the `Jenkinsfile` marked `<<< >>>`: your Docker Hub username, GitHub repo URL, EC2 host, and notification email.
- If you're fronting the container with Nginx (see the EC2 deployment guide above), Nginx keeps proxying to `localhost:4000` exactly as before — nothing changes there when you switch to Docker.


