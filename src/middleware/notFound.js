// backend/src/middleware/notFound.js

const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
    },
  });
};

module.exports = notFound;