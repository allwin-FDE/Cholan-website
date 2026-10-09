# Cloud Run image. node:sqlite is part of the runtime, so there is nothing
# native to compile and no build stage to carry.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src

# Cloud Run's filesystem is in-memory and per-instance, so the SQLite file is
# scratch space there: it is the write-ahead buffer in front of Firestore, not
# the lasting copy. Firestore is the record of truth once deployed.
ENV DB_FILE=/tmp/enquiries.db
EXPOSE 8080
CMD ["node", "src/server.js"]
