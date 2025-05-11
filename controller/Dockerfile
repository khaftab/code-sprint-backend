
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . ./

EXPOSE 1337

CMD ["npm", "run", "dev"]


FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-alpine AS production

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/setup.sh ./setup.sh
COPY --from=build /usr/src/app/dist ./dist

RUN chmod +x /usr/src/app/setup.sh

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
