FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .editorconfig .prettierrc.json eslint.config.js ./
COPY apps ./apps
COPY packages ./packages

CMD ["pnpm", "install", "--frozen-lockfile"]
