FROM oven/bun:1

WORKDIR /app

COPY package.json bunfig.toml ./
COPY src ./src
COPY public ./public

RUN mkdir -p /data && chown bun:bun /data

ENV HOST=0.0.0.0
ENV PORT=3000
ENV BUDGIE_DB=/data/budgie.db

EXPOSE 3000
VOLUME /data

USER bun

CMD ["bun", "run", "src/index.js"]
