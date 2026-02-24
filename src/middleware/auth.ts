import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${config.API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
