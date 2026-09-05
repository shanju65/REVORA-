# Revora Production Deployment Guide (Render + Vercel)

This repository is fully configured for production deployment using:
- **Backend**: [Render](https://render.com) (FastAPI + SQLite + Uvicorn Web Service)
- **Frontend**: [Vercel](https://vercel.com) (Next.js 16 + React 19)
- **Repository**: [https://github.com/shanju65/REVORA-.git](https://github.com/shanju65/REVORA-.git)

---

## Part 1: Deploy Backend on Render

You can deploy the backend using either **Render Blueprints (Automated)** or **Manual Web Service**.

### Option A: Render Blueprints (Recommended - 1 Click)
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top-right corner and select **Blueprint**.
3. Connect your GitHub repository: `shanju65/REVORA-`.
4. Render will automatically detect `render.yaml` in the repository root.
5. Click **Apply**.
6. (Optional) In the Environment tab, add your API keys:
   - `GEMINI_API_KEY`: Your Google Gemini API key (for conversational RAG & Pulse AI).
   - `RAZORPAY_KEY_ID`: Your Razorpay Test Key ID (for sandbox integration).
   - `RAZORPAY_KEY_SECRET`: Your Razorpay Test Secret.
7. Once deployed, copy your backend service URL (e.g. `https://revora-backend-xxxx.onrender.com`).

---

### Option B: Manual Web Service Setup
If you prefer configuring the Web Service manually:
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your repository: `shanju65/REVORA-`.
4. Configure the service settings:
   - **Name**: `revora-backend`
   - **Region**: Any (e.g., Oregon, Frankfurt, Singapore)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
5. Expand **Advanced** $\rightarrow$ **Environment Variables**, and add:
   - `CORS_ORIGINS`: `*`
   - `GEMINI_API_KEY`: `<your-gemini-api-key>`
   - `RAZORPAY_KEY_ID`: `<your-razorpay-key-id>`
   - `RAZORPAY_KEY_SECRET`: `<your-razorpay-key-secret>`
6. In **Health Check Path**, enter: `/health`.
7. Click **Create Web Service**.
8. Once built, copy your live backend URL (e.g. `https://revora-backend-xxxx.onrender.com`).
   - Test it by opening `https://revora-backend-xxxx.onrender.com/health` in your browser. You should receive `{"status":"healthy","database":"sqlite",...}`.

> **Optional: Persistent Disk for SQLite**
> If you want SQLite state (e.g. new runs, created transactions) to survive cold boots on Render's free tier:
> 1. In your Render Web Service settings, navigate to **Disks** $\rightarrow$ **Add Disks**.
> 2. Mount path: `/var/data`, Size: `1 GB`.
> 3. Add an environment variable: `REVORA_DB_PATH=/var/data/revora.db`.
> Revora will automatically copy the seed database into `/var/data/revora.db` on initial boot!

---

## Part 2: Deploy Frontend on Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import the GitHub repository: `shanju65/REVORA-`.
4. In the configuration screen:
   - **Framework Preset**: `Next.js` (automatically detected).
   - **Root Directory**: Click **Edit** and choose `revora/frontend` *(CRITICAL STEP)*.
5. Expand the **Environment Variables** section:
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: `https://revora-backend-xxxx.onrender.com` *(use your actual Render backend URL without trailing slash)*
6. Click **Deploy**.
7. Vercel will build and deploy the Next.js application in ~1 minute.

---

## Part 3: Verification & Checklist

1. Open your live Vercel frontend URL (e.g. `https://revora-xxxx.vercel.app`).
2. Verify:
   - **Dashboard**: KPI cards, Recovery Rate, and Recent Batch runs load data from the Render API.
   - **Batches / Recovery Engine**: Process batches and verify state transitions.
   - **Pulse AI**: Chat with the conversational RAG engine.
   - **Customer 360**: Verify filtering by customer health status (`HEALTHY`, `AT_RISK`, `RECOVERY`, `ESCALATED`).
   - **Recovery Intelligence**: Verify recovery funnels and AI action distribution charts.
