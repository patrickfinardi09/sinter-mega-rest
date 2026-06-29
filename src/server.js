require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const adminController = require('./controllers/adminController');
const resourceController = require('./controllers/resourceController');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.redirect('/admin/');
});

app.get('/admin/api/resources', adminController.listResources);
app.post('/admin/api/resources', adminController.saveResource);
app.delete('/admin/api/resources/:resource', adminController.deleteResource);
app.get('/admin/api/tables/:table/columns', adminController.listTableColumns);
app.use('/admin', express.static(publicDir));

app.get('/api/:resource', resourceController.getResource);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Erro interno do servidor.' : error.message;

  res.status(statusCode).json({ error: message });
});

async function start() {
  if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECT_STRING) {
    console.warn('Oracle nao configurado no .env. A GUI admin vai funcionar, mas /api/:resource precisa do banco.');
  }

  app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`);
  });
}

async function shutdown() {
  await db.closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((error) => {
  console.error('Falha ao iniciar a API:', error);
  process.exit(1);
});
