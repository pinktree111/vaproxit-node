FROM node:16-alpine

# Crea directory dell'applicazione
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze
RUN npm install --production

# Copia il resto dell'applicazione
COPY . .

# Esponi la porta definita nella variabile d'ambiente PORT o predefinita 10000
EXPOSE ${PORT:-10000}

# Avvia l'applicazione
CMD ["node", "index.js"]
