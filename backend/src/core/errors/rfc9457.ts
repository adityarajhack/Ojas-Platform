export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  invalidParams?: Array<{ field: string; reason: string }>;
  code?: string;
  timestamp: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string;
  public readonly code?: string;
  public readonly invalidParams?: Array<{ field: string; reason: string }>;

  constructor(params: {
    status: number;
    title: string;
    detail: string;
    type?: string;
    code?: string;
    invalidParams?: Array<{ field: string; reason: string }>;
  }) {
    super(params.detail);
    this.status = params.status;
    this.title = params.title;
    this.detail = params.detail;
    this.type = params.type || `https://gov.hackathon.internal/errors/${params.code || 'internal-error'}`;
    this.code = params.code;
    this.invalidParams = params.invalidParams;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toProblemDetails(instance?: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance,
      code: this.code,
      invalidParams: this.invalidParams,
      timestamp: new Date().toISOString(),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'Resource not found', code = 'resource-not-found') {
    super({ status: 404, title: 'Not Found', detail, code });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication required', code = 'unauthorized') {
    super({ status: 401, title: 'Unauthorized', detail, code });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Access forbidden for current credentials/scope', code = 'forbidden') {
    super({ status: 403, title: 'Forbidden', detail, code });
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'Resource state conflict', code = 'conflict') {
    super({ status: 409, title: 'Conflict', detail, code });
  }
}

export class ValidationError extends AppError {
  constructor(detail = 'Validation failed', invalidParams?: Array<{ field: string; reason: string }>) {
    super({
      status: 400,
      title: 'Bad Request',
      detail,
      code: 'validation-error',
      invalidParams,
    });
  }
}
