const { getResourceConfig } = require('../resources');
const resourceService = require('../services/resourceService');

async function getResource(req, res, next) {
  try {
    // JWT/API Key entraria aqui, antes de autorizar acesso ao resource.
    const resourceConfig = getResourceConfig(req.params.resource);

    if (!resourceConfig) {
      return res.status(404).json({
        error: 'Resource nao encontrado ou nao permitido.',
      });
    }

    const result = await resourceService.listResource(resourceConfig, req.query);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getResource,
};
