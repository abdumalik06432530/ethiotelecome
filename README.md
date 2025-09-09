# Site Management (Telecom Sites)

A lightweight web application to register, view, and manage telecom sites on an interactive map.

This repo contains a Node.js + Express backend with MongoDB (Mongoose) and a small vanilla-JavaScript frontend that uses Leaflet for mapping.

## Key features

- Register, edit, and delete sites (admin only)
- Store rich power-source details (Grid, Generator, Battery, Solar, Other)
- Interactive Leaflet map with zoom-aware, status-colored markers
- Compact power-source edit modal (power-only edits that merge into the site)
- Inline status editing for logged-in users (PATCH /sites/:id/status)
- CSV/Excel export of site data (admin)
- Environment-driven admin credentials and JWT-based auth
- Client-side filters: status (active / inactive / maintenance)

## Tech stack

- Backend: Node.js, Express, Mongoose (MongoDB)
- Frontend: Vanilla JavaScript, HTML, CSS, Leaflet
- Dev: Postman collection included in `/postman`

## Repository layout (important folders)

- `backend/` — Express API, models, controllers, routes
- `client/` — primary frontend (index.html, index.js, style.css)
- `project/` — alternate frontend copy used during development
- `postman/` — Postman collection and environment

## Environment (important variables)

Create a `.env` file in `backend/` (do not commit) using `.env.example` as a template. Required/used variables:

```
MONGODB_URI=mongodb://localhost:27017/ethio_telecom
PORT=8000
NODE_ENV=development
JWT_SECRET=replace-with-a-strong-secret
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
API_BASE_URL=http://localhost:8000/api
```

Keep `ADMIN_USERNAME`/`ADMIN_PASSWORD` secret. The frontend reads `API_BASE_URL` from client config (or `project` uses a hard-coded URL). Adjust if you deploy backend separately.

## Setup (Windows PowerShell)

1. Backend

```powershell
cd c:\Users\Malik\Desktop\intern\backend
npm install
# create backend/.env (copy .env.example)
# then start the server
npm start
```

2. Frontend (project copy)

```powershell
# open the project frontend in a simple static server or open index.html in a browser
cd c:\Users\Malik\Desktop\intern\project
# Optionally use a quick static server (npm install -g http-server)
http-server -p 5500
# then open http://localhost:5500/index.html
```

Or open `client/index.html` directly in your browser during development.

## How to use

- Login as admin (use `ADMIN_USERNAME` + `ADMIN_PASSWORD`) to add/edit/delete sites.
- Add a new site: click "Add New Site" in the sidebar. Power-source checkboxes reveal fields that are required only if selected.
- Edit a site: use the Edit button on a site or the marker popup. You can open a power-only editor to update just generator/battery/solar/grid/other details — these merge into the existing record and won't wipe unrelated fields.
- Filter: use the Status dropdown in the sidebar to filter by `All`, `Active`, `Inactive`, or `Maintenance`. The UI requests `/api/sites?status=...` from backend.
- Map: click a site list item or popup Details to focus the map (closer zoom). Markers scale with zoom for better detail.

## API overview

- GET /api/sites[?status=active|inactive|maintenance] — list sites (status filter supported)
- GET /api/sites/:id — single site
- POST /api/sites — create site (admin)
- PUT /api/sites/:id — update site (admin)
- DELETE /api/sites/:id — delete site (admin)
- PATCH /api/sites/:id/status — change site status (logged-in users)
- POST /api/auth/login — login (returns JWT)
- POST /api/auth/register — register user
- POST /api/auth/verify — verify token

## Troubleshooting

- Server doesn't start: confirm `MONGODB_URI` is correct and MongoDB is running.
- Auth errors: ensure `.env` `JWT_SECRET` and `ADMIN_*` are set and restart server.
- Map tiles not showing at deep zoom: some tile providers limit maxZoom; change tile layer provider in `project/index.js`.

## Development notes & next steps

- If you maintain both `client/` and `project/` frontends, keep them in sync (I changed mapping and filter logic in the `project/` copy).
- Consider adding unit tests for backend controllers and a small integration test for the API.
- Hardening: remove any dev fallback JWT secrets and require a strong `JWT_SECRET` in production.

## Contributing

- Create a feature branch, open a PR with a short description and steps to verify.

## License

Add a license file if you plan to open-source the project (MIT recommended).

---

If you want, I can also:

- Add a short `README` to the `backend/` and `project/` folders with run steps specific to each.
- Persist the status filter selection in localStorage.
- Sync the filter+map scaling changes into the `client/` frontend.

Which of these would you like next?
