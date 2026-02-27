FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 8000

ENV PORT=8000
ENV HOST=0.0.0.0

CMD ["node", "src/server.mjs"]
