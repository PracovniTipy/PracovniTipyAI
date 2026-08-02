FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

ENV HEROHERO_PROFILE_DIR=/app/herohero-profile
ENV HEROHERO_DEBUG_DIR=/app/herohero-debug

COPY package*.json ./

RUN npm ci

COPY . .

RUN mkdir -p /app/herohero-profile /app/herohero-debug

EXPOSE 8080

CMD ["npm", "run", "start"]
