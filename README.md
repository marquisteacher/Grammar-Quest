# 🎮 Grammar Quest

A Kahoot-style classroom grammar quiz show for 5th, 6th, and 7th grade.

## Features
- 📚 25 questions per grade level (5th, 6th, 7th)
- 🏆 4-team competition with live scoreboards
- 👤 Student sign-in with name + class number
- 🏅 Live leaderboard (top 5, updates after every answer)
- 🎉 Confetti winner screen
- 🌐 Persistent all-time scores via Firebase

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS → GitHub Pages
- **Backend:** Node.js + Express → Render
- **Database:** Firebase Firestore

## Quick Start
See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for full deployment instructions.

## Project Structure
```
grammar-quest/
├── frontend/
│   └── index.html        # Complete game UI
├── backend/
│   ├── server.js         # Express API
│   └── package.json
├── docs/
│   └── SETUP_GUIDE.md    # Step-by-step deployment
├── render.yaml           # Render deployment config
└── .gitignore
```
