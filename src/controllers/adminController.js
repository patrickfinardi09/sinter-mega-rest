const resourcesRegistry = require('../resources');
const oracleMetadataService = require('../services/oracleMetadataService');

function listResources(req, res) {
  res.json(resourcesRegistry.getResources());
}

function saveResource(req, res, next) {
  try {
    const savedResource = resourcesRegistry.saveResource(req.body);
    res.status(200).json(savedResource);
  } catch (error) {
    next(error);
  }
}

function deleteResource(req, res, next) {
  try {
    const deleted = resourcesRegistry.deleteResource(req.params.resource);

    if (!deleted) {
      return res.status(404).json({ error: 'Resource nao encontrado.' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function listTableColumns(req, res, next) {
  try {
    const result = await oracleMetadataService.listTableColumns(req.params.table);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  deleteResource,
  listTableColumns,
  listResources,
  saveResource,
};
