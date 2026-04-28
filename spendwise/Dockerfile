FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "[ ! -f node_modules/.package-lock.json ] && npm ci; npm run dev"]
