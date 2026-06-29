FROM container-registry.oracle.com/os/oraclelinux:9-slim

ENV NODE_ENV=production \
    PORT=3000 \
    ORACLE_CLIENT_LIB_DIR=/usr/lib/oracle/23/client64/lib \
    TNS_ADMIN=/opt/oracle/network/admin

WORKDIR /app

RUN microdnf install -y oracle-instantclient-release-26ai-el9 \
    && microdnf install -y \
      oracle-instantclient-basic \
      nodejs \
      npm \
      shadow-utils \
    && microdnf clean all \
    && rm -rf /var/cache/dnf /var/cache/yum

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY src ./src
COPY public ./public
RUN mkdir -p /app/seed
COPY data/resources.json ./seed/resources.json

RUN mkdir -p /opt/oracle/network/admin /app/data \
    && cp /app/seed/resources.json /app/data/resources.json \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /sbin/nologin app \
    && chown -R app:app /app/data \
    && chmod 0755 /opt/oracle/network/admin \
    && chmod -R a=rX /app/seed

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.PORT||3000;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:4000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

CMD ["sh", "-ec", "if [ ! -f /app/data/resources.json ] && [ -f /app/seed/resources.json ]; then cp /app/seed/resources.json /app/data/resources.json; fi; exec node src/server.js"]
