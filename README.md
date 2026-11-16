# SAiLL – Student Academic Information & Learning Platform

SAiLL is a web-based academic management platform designed to simplify academic activities and improve coordination between students, faculty, and administrators.

## Features

- **Student Dashboard** – Access academic information and track learning progress.
- **Faculty Dashboard** – Manage assigned classes and monitor student progress.
- **Admin Dashboard** – Manage students, faculty, academic batches, branches, sections, and assignments.
- **Academic Management** – Organize students based on their programme, branch, semester, and section.
- **Progress Tracking** – Monitor student module completion and academic progress.
- **Role-Based Access** – Provide different access and functionality for students, faculty, and administrators.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend & Database:** Supabase
- **Authentication:** Supabase Authentication
- **Database Security:** Supabase Row Level Security (RLS)
- **Version Control:** Git and GitHub

## Getting Started

### Prerequisites

- Node.js
- npm
- A Supabase project

### 1. Clone the repository

```bash
git clone https://github.com/Shiva-Reddy18/Saill-SRIT.git
cd Saill-SRIT
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root and add your Supabase project credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the application

```bash
npm run dev
```

The application will be available at the local development URL displayed in your terminal.

### 5. Build for production

```bash
npm run build
```

## Project Structure

```text
Saill-SRIT/
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── lib/
│   └── ...
├── .env
├── package.json
└── README.md
```

## Security

- Keep environment variables private.
- Never expose Supabase service-role keys in frontend code.
- Configure appropriate Row Level Security policies for database access.

## Contributors

Developed as an academic software project for SRIT.

---

**SAiLL – Simplifying Academic Management.**