import { AppError } from "../utils/app-error.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload"
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  const fallbackMessage =
    typeof error === "string"
      ? error
      : typeof error?.error?.description === "string"
        ? error.error.description
        : typeof error?.description === "string"
          ? error.description
          : "Unexpected server error";

  console.error("Unhandled error", {
    message: error?.message ?? fallbackMessage,
    stack: error?.stack ?? null,
    path: req.originalUrl
  });

  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error"
    }
  });
}
