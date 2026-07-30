export class ApiResponse<T> {
  success: boolean
  message: string
  data?: T
  meta?: any

  constructor(success: boolean, message: string, data?: T, meta?: any) {
    this.success = success
    this.message = message
    if (data !== undefined) this.data = data
    if (meta !== undefined) this.meta = meta
  }

  static success<T>(data: T, message: string = "Success", meta?: any): ApiResponse<T> {
    return new ApiResponse(true, message, data, meta)
  }

  static error(message: string, data?: any): ApiResponse<any> {
    return new ApiResponse(false, message, data)
  }
}
