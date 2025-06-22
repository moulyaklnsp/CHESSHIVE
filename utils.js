const getMessages = (req) => ({
    successMessage: req.query["success-message"] || null,
    errorMessage: req.query["error-message"] || null,
  });
  
  const renderDashboard = (dashboard, req, res, extraData = {}) => {
    res.render(dashboard, { ...getMessages(req), ...extraData });
  };
  
  module.exports = { getMessages, renderDashboard };