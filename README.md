# Notion Time Tracker

A locally hosted web application for time tracking that synchronizes with a Notion workspace.

## 🤖 For AI Assistants

**IMPORTANT**: If you're an AI assistant working on this project, please read [`AI_PROJECT_GUIDE.md`](./AI_PROJECT_GUIDE.md) first. It contains critical information about using Docker instead of npm commands and other project-specific guidance.

## Prerequisites

* **Docker & Docker Compose:** Ensure Docker and Docker Compose are installed on your system.
    * Windows/macOS: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
    * Linux: Follow the official Docker installation guide for your distribution and then install Docker Compose.
* **Git:** For cloning the repository.
* **Node.js & npm:** (Optional, for local development outside Docker or for running utility scripts if any are Node-based). It's recommended to use the versions specified in `backend/Dockerfile` (Node 18).

## Initial Setup (Part 1 - Backend Only)

1.  **Clone the Repository (If you haven't already):**
    ```bash
    git clone <your-repository-url> notion-time-tracker
    cd notion-time-tracker
    ```

2.  **Configure Environment Variables:**
    * Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    * Open the `.env` file in a text editor and fill in the required values:
        * `BACKEND_PORT` (default is `3001`)
        * `FRONTEND_PORT` (default is `3000`)
        * `NOTION_API_KEY`: Your Notion Integration Token.
        * `NOTION_CLIENTS_DB_ID`: The ID of your Notion database for Clients.
        * `NOTION_PROJECTS_DB_ID`: The ID of your Notion database for Projects.
        * `NOTION_TASKS_DB_ID`: The ID of your Notion database for Tasks.
        * *(Instructions for getting Notion API Key and Database IDs will be added in a later section once Notion integration is detailed).*

3.  **Build and Start the Backend Service:**
    This command will build the Docker image for the backend (if not already built) and start the container. The `-d` flag runs it in detached mode.
    ```bash
    docker-compose up --build backend -d
    ```

4.  **Verify Backend is Running:**
    * Check Docker container logs:
        ```bash
        docker-compose logs backend
        ```
        You should see messages like "Connected to the SQLite database." and "Backend server listening on http://localhost:3001".
    * Open your browser and navigate to `http://localhost:3001` (or your configured `BACKEND_PORT`). You should see "Notion Time Tracker Backend is running!".

5.  **Initialize Database Schema (if not automatically handled by app start):**
    The current `database.js` attempts to initialize on app start. If you need to run it manually (e.g., after schema changes or if the initial run failed):
    ```bash
    docker-compose exec backend npm run db:init
    ```
    This command executes `npm run db:init` inside the running `backend` container.

6.  **To Stop the Backend Service:**
    ```bash
    docker-compose stop backend
    ```

7.  **To Stop and Remove Containers (and network if no other services use it):**
    ```bash
    docker-compose down
    ```

---

*(This README will be significantly expanded with frontend setup, full application start/stop scripts, Notion configuration details with screenshots, and troubleshooting.)*