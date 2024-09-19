class ApiError extends Error {
  constructor(
    statusCode,
    message = "Something went wrong",
    errors = [],
    stack = ""
  ) {
    super(message);
    this.statusCode = statusCode;
    (this.data = null),
      (this.message = message),
      (this.errors = errors),
      (this.sucess = false);

    if (stack) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
