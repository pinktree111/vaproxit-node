FROM node:16-alpine

# Crea directory dell'applicazione
WORKDIR /app

# Copia il file index.js e crea un package.json minimo all'interno del container
COPY index.js .
COPY canali_con_loghi_finale.json* ./

RUN echo '{"name":"vavoo-stremio-italy","version":"1.0.0","private":true,"dependencies":{"stremio-addon-sdk":"^1.6.10","express":"^4.18.2","cors":"^2.8.5","axios":"^1.6.2"}}' > package.json

# Installa le dipendenze
RUN npm install --omit=dev

# Esponi la porta definita nella variabile d'ambiente PORT o predefinita 10000
EXPOSE ${PORT:-10000}

# Avvia l'applicazione
CMD ["node", "index.js"]
