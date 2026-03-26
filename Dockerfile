FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts
RUN npm run build

EXPOSE 8080

ENV NOTION_API_TOKEN=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
ENV MCP_TRANSPORT=sse

CMD ["node", "build/index.js"]
