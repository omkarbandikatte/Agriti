# Agri-tech (AGR2640) — Runtime Revenge

Agri-tech is a full-stack project (frontend + backend + chatbot) aimed at agriculture-focused workflows and experiences.

> Repo: https://github.com/omkarbandikatte/Agri-tech_Agr2640_Runtime_Revenge  
> Tech mix (approx.): JavaScript (53%), Python (45%), plus small amounts of C#, HTML/CSS.

---

## Repository structure

- `frontend/` — Web client (JavaScript-based)
- `backend/` — Server-side API/services
- `chatBot/` — Chatbot component (Python-based)

---

## Getting started

### Prerequisites
Make sure you have installed:
- **Git**
- **Node.js + npm** (for `frontend/` and/or any JS services)
- **Python 3.x + pip** (for `backend/` and/or `chatBot/`)

---

## Setup & Run (typical workflow)

### 1) Clone the repository
```bash
git clone https://github.com/omkarbandikatte/Agri-tech_Agr2640_Runtime_Revenge.git
cd Agri-tech_Agr2640_Runtime_Revenge
```

### 2) Frontend
```bash
cd frontend
npm install
npm start
```

### 3) Backend
Depending on how the backend is implemented:

**If backend is Node.js:**
```bash
cd backend
npm install
npm start
```

**If backend is Python:**
```bash
cd backend
python -m venv .venv
# activate venv:
#   Windows: .venv\Scripts\activate
#   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

### 4) ChatBot
```bash
cd chatBot
python -m venv .venv
# activate venv:
#   Windows: .venv\Scripts\activate
#   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

---

## Configuration

If the project uses environment variables, create a `.env` file (or per-component `.env` files) and configure values such as:
- API base URL
- Database connection string
- Secret keys / tokens
- Chatbot model / provider keys (if applicable)

> Tip: if you have `.env.example` files, copy them to `.env` and fill in values.

---

## Scripts (common)

From each component directory (`frontend/`, `backend/`):
- `npm start` — run locally
- `npm test` — run tests (if configured)
- `npm run build` — build for production (frontend)

For Python components:
- `python -m pytest` — run tests (if present)
- `pip freeze` — inspect installed deps

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit changes: `git commit -m "Describe change"`
4. Push branch: `git push origin feature/my-change`
5. Open a Pull Request

---

## License

No license file was detected in the repository metadata. If you intend this project to be open-source, consider adding a `LICENSE` file (MIT, Apache-2.0, GPL, etc.).

---

## Acknowledgements

This repository is a fork of:
- https://github.com/Denimworld12/Agri-tech_Agr2640_Runtime_Revenge
