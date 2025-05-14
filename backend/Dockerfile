# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app/backend

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# Make port 3001 available to the world outside this container
# This is informational; the actual port mapping happens in docker-compose.yml
EXPOSE 3001

# Define environment variables (can be overridden in docker-compose.yml)
ENV NODE_ENV=development
ENV DATABASE_PATH=/data/notion_time_tracker.sqlite
# Other ENV vars like NOTION_API_KEY will be set via docker-compose from .env

# Create a directory for the SQLite database if it doesn't exist
# and ensure the node user has permissions
RUN mkdir -p /data && chown -R node:node /data

# Change to a non-root user
USER node

# Run the app when the container launches
CMD ["npm", "start"]