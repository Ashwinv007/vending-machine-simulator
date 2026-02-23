const methodsWithBody = new Set(["POST", "PUT", "PATCH"]);

export function validateJson(req, res, next) {
  if (!methodsWithBody.has(req.method)) {
    return next();
  }

  if (!req.is("application/json")) {
    return res.status(415).json({
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json"
      }
    });
  }

  return next();
}
