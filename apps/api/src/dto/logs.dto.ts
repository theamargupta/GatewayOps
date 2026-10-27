import { z } from 'zod';
import { ApiLog } from '../types';

export interface LogsQueryParams {
  page?: number;
  limit?: number;
  service?: string;
  // An exact HTTP status (100-599) or a class digit 1-5 meaning [n00, n99] (the UI's "5xx" sends 5).
  statusCode?: number;
  // YYYY-MM-DD means a whole UTC day; a full ISO timestamp is used as given.
  from?: string;
  to?: string;
  search?: string;
}

export interface LogResponse extends ApiLog {
  service_name?: string;
}

export const MAX_LIMIT = 100;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const isDateOnly = (value: string) => DATE_ONLY.test(value);

const dateParam = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be YYYY-MM-DD or an ISO timestamp');
const statusParam = z.coerce
  .number()
  .int()
  .refine((n) => (n >= 1 && n <= 5) || (n >= 100 && n <= 599), 'must be a class digit 1-5 or a status code 100-599');

// The web LogFilters sends its whole state on every change, so an "All" select arrives as `statusCode=`.
// An empty value means "no filter". Optional sits INSIDE preprocess (Zod optionality guide).
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalFilter = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

// Express hands query values over as strings; every failure here is a ZodError, which errorHandler maps to 400.
export const logsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(10),
    service: optionalFilter(z.string().min(1)),
    statusCode: optionalFilter(statusParam),
    from: optionalFilter(dateParam),
    to: optionalFilter(dateParam),
    search: optionalFilter(z.string()),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: 'from must not be after to',
    path: ['from'],
  });
