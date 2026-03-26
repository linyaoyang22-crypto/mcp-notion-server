FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts
RUN npm run build

EXPOSE 8080

CMD ["node", "build/index.js"]
