import type { Response } from 'express';
export function success(res: Response, data: unknown, message = 'Success', status = 200): void { res.status(status).json({ success: true, data, message }); }
