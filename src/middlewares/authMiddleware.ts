import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { ApiError } from "../api/ApiError"
import { User } from "../models/User"
import { Permission } from "../config/permissions"
import { ROLE_PERMISSIONS, Role } from "../config/roles"

export interface AuthRequest extends Request {
  user?: any
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined

    // Allow Bot API Key bypass for internal services
    if (req.headers["x-bot-api-key"] && req.headers["x-bot-api-key"] === process.env.BOT_API_KEY) {
      req.user = { role: "superadmin", name: "WhatsApp Bot" }
      return next()
    }

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    } else if (req.cookies?.token) {
      token = req.cookies.token
    }

    if (!token || token === "none") {
      return next(new ApiError(401, "Please login to access this route"))
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    const user = await User.findById(decoded.id)

    if (!user) {
      return next(new ApiError(401, "User no longer exists"))
    }

    req.user = user
    next()
  } catch (error) {
    return next(new ApiError(401, "Not authorized — token invalid or expired"))
  }
}

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"))
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `Role '${req.user.role}' cannot access this route`))
    }
    next()
  }
}

export const requirePermission = (permission: Permission) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"))
    const userPermissions = ROLE_PERMISSIONS[req.user.role as Role] || []
    if (!userPermissions.includes(permission)) {
      return next(new ApiError(403, `Missing permission: ${permission}`))
    }
    next()
  }
}

// Bot API key middleware (for WhatsApp bot internal calls)
export const botAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-bot-api-key"]
  if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
    return next(new ApiError(401, "Invalid bot API key"))
  }
  next()
}
