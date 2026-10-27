import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { LogsService } from '../services/logs.service';
import { logsQuerySchema } from '../dto/logs.dto';

const logsService = new LogsService();

export class LogsController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await logsService.getLogs(logsQuerySchema.parse(req.query));

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async findOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const log = await logsService.getLogById(id);
      res.json({ data: log });
    } catch (error) {
      next(error);
    }
  }
}
