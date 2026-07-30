import { Request, Response, NextFunction } from "express"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { logger } from "../utils/logger"
import { ZodError } from "zod"

export const errorHandler = (
  err: Error | ApiError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ZodError) {
    logger.error(`Validation Error: ${JSON.stringify(err.errors)}`)
    return res.status(400).json(ApiResponse.error("Validation Error", err.errors))
  }

  if (err instanceof ApiError) {
    logger.error(`ApiError [${err.statusCode}]: ${err.message}`)
    return res.status(err.statusCode).json(ApiResponse.error(err.message, err.errors))
  }

  // Mongoose Duplicate Key
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue)[0]
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
    logger.error(`Duplicate Key [400]: ${message}`)
    return res.status(400).json(ApiResponse.error(message))
  }

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    const message = Object.values((err as any).errors)
      .map((val: any) => val.message)
      .join(", ")
    logger.error(`Mongoose Validation [400]: ${message}`)
    return res.status(400).json(ApiResponse.error(message))
  }

  // Mongoose Cast Error (invalid ObjectId)
  if (err.name === "CastError") {
    logger.error(`Cast Error [400]: ${err.message}`)
    return res.status(400).json(ApiResponse.error("Invalid ID format"))
  }

  logger.error(`Unhandled Error: ${err.message}\nStack: ${err.stack}`)
  return res.status(500).json(
    new ApiResponse(false, "Internal Server Error", undefined, {
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    })
  )
}
